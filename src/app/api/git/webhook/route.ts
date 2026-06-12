/**
 * /api/git/webhook — GitHub pull_request events → automatic AI review.
 *
 * Each watched repo has its own secret; the X-Hub-Signature-256 HMAC proves
 * the event is genuine and identifies which RepoWatch (and whose token) to
 * act with. On a PR opened/synchronized we fetch the diff, run the reviewer,
 * and post a review with inline comments. Work runs after the 200 so GitHub's
 * delivery doesn't time out.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { withGitAuth } from "@/lib/git";
import { getGitAuth } from "@/lib/git";
import { fetchPullFiles, alreadyReviewed, postPullReview } from "@/lib/git/github";
import { runReviewer, PROVIDER_DEFAULT_MODEL } from "@/lib/ai-agent";
import { OPENAI_MODEL } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 300;

function verify(secret: string, body: string, signature: string | null): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PrPayload {
  action?: string;
  number?: number;
  pull_request?: { number?: number; head?: { sha?: string } };
  repository?: { full_name?: string };
}

export async function POST(req: Request) {
  if ((req.headers.get("x-github-event") ?? "") !== "pull_request") {
    return new Response("ignored", { status: 200 });
  }
  const raw = await req.text();
  let payload: PrPayload;
  try {
    payload = JSON.parse(raw) as PrPayload;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const repo = payload.repository?.full_name;
  const prNumber = payload.pull_request?.number ?? payload.number;
  const headSha = payload.pull_request?.head?.sha;
  if (!repo || !prNumber) return new Response("ok", { status: 200 });

  const watch = await db().repoWatch.findUnique({ where: { provider_repo: { provider: "github", repo } } });
  if (!watch) return new Response("not watched", { status: 404 });
  if (!verify(watch.secret, raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("bad signature", { status: 401 });
  }

  // Only review meaningful states; ack everything else.
  if (!["opened", "synchronize", "reopened", "ready_for_review"].includes(payload.action ?? "")) {
    return new Response("ok", { status: 200 });
  }

  after(async () => {
    try {
      const auth = await getGitAuth(watch.userId, "github");
      if (!auth) return;
      await withGitAuth(auth, async () => {
        if (headSha && (await alreadyReviewed(repo, prNumber, headSha))) return;

        const files = await fetchPullFiles(repo, prNumber);
        if (!files || files.length === 0) return;

        let diffText = "";
        for (const f of files) {
          if (diffText.length > 28_000) {
            diffText += `\n… (${files.length} files total — remainder omitted)\n`;
            break;
          }
          diffText += `=== ${f.filename} (${f.status}) ===\n${(f.patch ?? "(no textual diff)").slice(0, 8_000)}\n\n`;
        }

        const prefs = await db().userPreferences.findUnique({
          where: { userId: watch.userId },
          select: { aiProvider: true, aiModel: true, aiBaseUrl: true, openaiKey: true, anthropicKey: true, localKey: true },
        });
        const provider = prefs?.aiProvider ?? "openai";
        const prefModel = prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? "");
        const model = prefModel || PROVIDER_DEFAULT_MODEL[provider] || OPENAI_MODEL;
        const apiKey =
          (provider === "openai" ? prefs?.openaiKey : provider === "anthropic" ? prefs?.anthropicKey : prefs?.localKey) ||
          undefined;

        const review = await runReviewer({ provider, model, apiKey, baseUrl: prefs?.aiBaseUrl || undefined, diffText });
        if ("error" in review) return;

        // Parse "path:line: comment" lines into inline comments; the rest is
        // the summary body.
        const comments: { path: string; line: number; body: string }[] = [];
        const summaryLines: string[] = [];
        const known = new Set(files.map((f) => f.filename));
        for (const line of review.text.split("\n")) {
          // Matches "path:line: comment", with the path:line optionally wrapped
          // in backticks (` `path:line` ` or `path:line`).
          const m = line.match(/^[-*\s]*`?([\w./-]+):(\d+)`?:?\s*(.+)$/);
          if (m && known.has(m[1]) && comments.length < 20) {
            comments.push({ path: m[1], line: Number(m[2]), body: m[3].trim() });
          } else {
            summaryLines.push(line);
          }
        }
        const body = `**Helix review**\n\n${summaryLines.join("\n").trim() || review.text}`;
        await postPullReview(repo, prNumber, { body, comments });
      });
    } catch (e) {
      console.error("[helix-webhook] review failed", e);
    }
  });

  return new Response("ok", { status: 200 });
}
