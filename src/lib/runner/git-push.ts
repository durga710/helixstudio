import "server-only";

/**
 * Git-native push: run real git inside the workspace's cloud VM. Clone the
 * repo, apply the overlay, commit, rebase onto the latest base branch (so an
 * upstream move doesn't clobber and a real conflict fails safe), and push.
 * This replaces the synthetic single-commit REST push with real history that
 * survives a moved upstream — the editing model stays the fast overlay.
 *
 * The auth token rides in the clone URL; it is never logged (redacted from
 * any captured output).
 */

import type { Workspace } from "@/generated/prisma/client";
import type { GitAuth } from "@/lib/git";
import { isSafeRepoPath, isValidBranchName } from "@/lib/repo-files";
import { ensurePreparedSandbox } from "./vercel-sandbox";

const CLONE_DIR = "helix-push-repo"; // relative to the VM's /vercel/sandbox cwd

export interface GitPushOpts {
  repo: string;
  branch: string;
  baseBranch: string;
  message: string;
  files: { path: string; content: string }[];
  deletions: string[];
}

export type GitPushResult =
  | { branch: string; commitSha: string; commitUrl: string }
  | { error: string; conflict?: boolean };

/** Authenticated HTTPS clone URL per provider (token embedded). */
function authedCloneUrl(auth: GitAuth, repo: string): string | { error: string } {
  const token = encodeURIComponent(auth.token);
  switch (auth.provider) {
    case "github":
      return `https://x-access-token:${token}@github.com/${repo}.git`;
    case "gitlab": {
      const host = (auth.baseUrl ?? "https://gitlab.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
      return `https://oauth2:${token}@${host}/${repo}.git`;
    }
    case "bitbucket":
      return `https://x-token-auth:${token}@bitbucket.org/${repo}.git`;
    case "gitea": {
      if (!auth.baseUrl) return { error: "Gitea base URL is not set." };
      const host = auth.baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      return `https://${token}@${host}/${repo}.git`;
    }
    case "azure": {
      // repo = "org/project/repo"; org also in auth.org.
      const [org, project, name] = repo.split("/");
      if (!org || !project || !name) return { error: "Azure repo must be org/project/repo." };
      return `https://${token}@dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(name)}`;
    }
  }
}

/** Provider web URL for a pushed commit (the "commit" link in the success UI). */
function commitWebUrl(auth: GitAuth, repo: string, sha: string): string {
  switch (auth.provider) {
    case "github":
      return `https://github.com/${repo}/commit/${sha}`;
    case "gitlab": {
      const base = (auth.baseUrl ?? "https://gitlab.com").replace(/\/+$/, "");
      return `${base}/${repo}/-/commit/${sha}`;
    }
    case "bitbucket":
      return `https://bitbucket.org/${repo}/commits/${sha}`;
    case "gitea": {
      const base = (auth.baseUrl ?? "").replace(/\/+$/, "");
      return base ? `${base}/${repo}/commit/${sha}` : "";
    }
    case "azure": {
      const [org, project, name] = repo.split("/");
      return org && project && name
        ? `https://dev.azure.com/${org}/${project}/_git/${name}/commit/${sha}`
        : "";
    }
    default:
      return "";
  }
}

/** Strip any embedded credentials from command output before surfacing it. */
function redact(text: string): string {
  return text.replace(/https:\/\/[^@\s/]+@/g, "https://***@").replace(/:[^@\s/]+@/g, ":***@");
}

const sh = (s: string) => s.replace(/\n+/g, "\n");

export async function gitPush(ws: Workspace, auth: GitAuth, opts: GitPushOpts): Promise<GitPushResult> {
  const url = authedCloneUrl(auth, opts.repo);
  if (typeof url === "object") return url;

  const prepared = await ensurePreparedSandbox(ws);
  if ("error" in prepared) return prepared;
  const { sandbox } = prepared;

  const onBase = opts.branch === opts.baseBranch;
  // baseBranch is interpolated into shell (incl. an unquoted `origin/${bb}`), so
  // it must be a valid git ref. Fall back to "main" if anything looks off.
  const bb = isValidBranchName(opts.baseBranch) ? opts.baseBranch : "main";

  try {
    // 1. Clean clone (shallow). Empty repos can't be cloned with -b → init.
    const clone = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        sh(`
          set -e
          command -v git >/dev/null 2>&1 || sudo dnf install -y git >/dev/null 2>&1
          rm -rf ${CLONE_DIR}
          if git clone --depth 50 -b "${bb}" "$GIT_URL" ${CLONE_DIR} 2>/tmp/clone.err; then
            echo CLONED
          else
            mkdir -p ${CLONE_DIR}
            cd ${CLONE_DIR}
            git init -q
            git remote add origin "$GIT_URL"
            git checkout -q -b "${bb}"
            echo INIT
          fi
        `),
      ],
      env: { GIT_URL: url },
    });
    const cloneOut = redact(await clone.stdout());
    const empty = cloneOut.includes("INIT");
    if (clone.exitCode !== 0 && !empty) {
      const err = redact(await clone.stderr());
      return { error: `Couldn't clone ${opts.repo}: ${err.slice(0, 300) || "check the repo and your token."}` };
    }

    // 2. Apply the overlay into the clone.
    if (opts.files.length > 0) {
      await sandbox.writeFiles(
        opts.files.map((f) => ({ path: `${CLONE_DIR}/${f.path}`, content: Buffer.from(f.content, "utf8") })),
      );
    }

    // 3. Branch, commit, rebase onto latest base, push.
    // SECURITY (C3): deletion paths originate from the workspace overlay (model /
    // virtual-FS controlled) and are interpolated into `sh -c`. Only paths that
    // pass isSafeRepoPath (no shell metacharacters: no $ ` \ " ; & | etc.) are
    // allowed; anything else is dropped rather than executed. The push route also
    // rejects unsafe deletions up front — this is defense in depth.
    const safeDeletions = opts.deletions.filter(isSafeRepoPath);
    const delCmds = safeDeletions
      .map((p) => `git rm -f --ignore-unmatch -- "${p}" >/dev/null 2>&1 || true`)
      .join("\n");
    const branchCmd = onBase ? "" : `git checkout -q -b "${opts.branch}"`;
    const rebaseCmd = empty
      ? "" // nothing upstream to rebase onto
      : sh(`
          git fetch -q --depth 50 origin "${bb}" || true
          if ! git rebase -q origin/${bb} 2>/tmp/rebase.err; then
            git rebase --abort >/dev/null 2>&1 || true
            echo CONFLICT
            exit 0
          fi
        `);

    const push = await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        sh(`
          cd ${CLONE_DIR}
          git config user.email "bot@helixstudio.org"
          git config user.name "Helix"
          ${delCmds}
          ${branchCmd}
          git add -A
          if git diff --cached --quiet; then echo NOTHING_TO_COMMIT; exit 0; fi
          git commit -q -m "$GIT_MSG"
          ${rebaseCmd}
          if git push origin "${opts.branch}" 2>&1; then
            echo "PUSHED:$(git rev-parse HEAD)"
          else
            echo "PUSH_FAILED"
          fi
        `),
      ],
      env: { GIT_MSG: opts.message },
    });
    const out = redact(`${await push.stdout()}\n${await push.stderr()}`);

    if (out.includes("NOTHING_TO_COMMIT")) return { error: "Nothing to push — no changes against the base branch." };
    if (out.includes("CONFLICT")) {
      return {
        conflict: true,
        error: `Your changes conflict with new commits on ${bb}. Pull the latest into the workspace, resolve, and push again.`,
      };
    }
    const m = out.match(/PUSHED:([0-9a-f]{7,40})/);
    if (!m || out.includes("PUSH_FAILED")) {
      const tail = out.replace(/PUSH_FAILED/g, "").split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300);
      return { error: `Push to ${opts.repo} failed — check your token has write access. ${tail}` };
    }

    return { branch: opts.branch, commitSha: m[1]!, commitUrl: commitWebUrl(auth, opts.repo, m[1]!) };
  } catch (e) {
    return { error: `Git push failed in the cloud VM: ${e instanceof Error ? redact(e.message) : "unknown error"}` };
  }
}
