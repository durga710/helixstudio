/**
 * /api/workspaces/[id]/chat
 *   POST → one agent turn: { message }. Streams NDJSON events (one JSON per
 *          line): { type: "activity", label } while tools run, then
 *          { type: "final", text, actions, changes, guestRemaining } or
 *          { type: "error", message, code? }. The agent machinery itself
 *          lives in src/lib/agent-turn.ts (shared with background tasks and
 *          the change reviewer).
 *
 * Guard failures (auth/rate limit/validation) return plain JSON — clients
 * detect the stream by the x-ndjson content type.
 */

import { after } from "next/server";
import { z } from "zod";
import { apiErrors } from "@/lib/api-response";
import { runAgentTurn } from "@/lib/agent-turn";
import { runBuildPipeline } from "@/lib/orchestrator";
import { maybeCompactConversation } from "@/lib/conversation-memory";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { guardWorkspace } from "@/lib/route-helpers";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
// Verify can add a sandbox build (~30-90s) + a fix turn on top of the build, so
// allow up to 300s (Fluid Compute ceiling). Plain build/plan turns finish fast.
export const maxDuration = 300;

const ChatSchema = z.object({
  message: z.string().min(1).max(8000),
  // A model-only instruction prefix (e.g. the build studio's scaffold brief).
  // The model sees it, but it's never persisted or shown — keeps internal
  // prompts out of the chat UI / editor history.
  brief: z.string().max(2000).optional(),
  // "plan": read-only agent turn that replies with an implementation plan.
  mode: z.enum(["plan", "build"]).default("build"),
  // A build turn that writes files runs + verifies in the sandbox (auto-fixing
  // once). Optional: when omitted the server applies VERIFY_DEFAULT_ON; the UI
  // sends an explicit value from its toggle.
  verify: z.boolean().optional(),
  // /build opts into the full seven-agent pipeline (planner → analyzer →
  // architect → engineer → reviewer → security → performance), streaming
  // per-agent `phase` events. The editor keeps its lean single turn.
  pipeline: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("chat", id, { limit: 100, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const message = parsed.data.message;

  const encoder = new TextEncoder();
  // The turn runs in this promise. We stream its events to the connected client,
  // but we ALSO hand the promise to after() so Vercel keeps the function alive
  // until the turn finishes even if the client navigates away mid-build — the
  // result still persists (runAgentTurn), so it's there when the user returns.
  let turnPromise: Promise<void> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true; // client went away — keep the turn running to completion
        }
      };

      turnPromise = (async () => {
        try {
          // /build runs the full seven-agent pipeline; everything else (the
          // editor) runs the lean single turn. Both share the event channel.
          const usePipeline = parsed.data.pipeline && parsed.data.mode === "build";
          const result = usePipeline
            ? await runBuildPipeline({
                ws,
                userId: user.id,
                message,
                briefPrefix: parsed.data.brief,
                verify: parsed.data.verify,
                onEvent: (e) => write(e),
              })
            : await runAgentTurn({
                ws,
                userId: user.id,
                message,
                briefPrefix: parsed.data.brief,
                mode: parsed.data.mode,
                verify: parsed.data.verify,
                onEvent: (e) => write(e),
              });
          if ("error" in result) {
            write({ type: "error", message: result.error, code: result.code });
          } else {
            write({
              type: "final",
              text: result.text,
              summary: result.summary ?? undefined,
              actions: result.actions,
              changes: result.changes,
              verify: result.verify,
              guestRemaining: result.guestRemaining,
              phases: "phases" in result ? result.phases : undefined,
            });
          }
        } catch (e) {
          reportError(e, { at: "chat.turn", workspaceId: ws.id, userId: user.id });
          write({ type: "error", message: "Something went wrong. Try again." });
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      })();
    },
  });

  // Keep the serverless function alive until the turn completes even if the
  // client navigates away — but ONLY for premium (pro/team) and admins. Guests
  // and free users get the live stream while connected; if they leave, the turn
  // is allowed to stop, so we never spend compute keeping a free session's build
  // running in the background. (The static preview stays free for everyone — it
  // re-renders from the saved files client-side.)
  const dbu = await db().user.findUnique({ where: { id: user.id }, select: { tier: true, isGuest: true } });
  const premiumBuild =
    isAdminEmail(user.email) || (!dbu?.isGuest && (dbu?.tier === "pro" || dbu?.tier === "team"));
  if (turnPromise && premiumBuild) {
    // Once the turn has persisted its messages, fold aged-out turns into the
    // workspace's rolling AI summary (smart compaction). It's a cheap no-op
    // until a full batch accrues and is budget-metered, so it just rides the
    // tail of the keep-alive we're already paying for. Free/guest sessions
    // aren't kept alive, so they keep the deterministic digest (unchanged).
    after(turnPromise.then(() => maybeCompactConversation({ workspaceId: ws.id, userId: user.id })));
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Disable proxy buffering so events reach the client as they happen.
      "X-Accel-Buffering": "no",
    },
  });
}
