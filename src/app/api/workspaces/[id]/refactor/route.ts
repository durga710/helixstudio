/**
 * /api/workspaces/[id]/refactor — start a durable planner→workers→reviewer JOB
 * for a large/structural change. ADMIN-ONLY for now (Phase B rollout, matching
 * transform mode). The job decomposes the request, runs scoped workers, and
 * gates on a reviewer — all on the Phase-A durable runner (survives the 300s
 * ceiling). Poll /api/workspaces/[id]/tasks for status (jobs are WorkspaceTasks).
 */

import { z } from "zod";
import { ok, err, apiErrors } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { enqueueJob } from "@/lib/jobs/driver";
import { guardWorkspace } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().min(1).max(8000) });

type Params = { params: Promise<{ id: string }> };

function reqOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("refactor", id, { limit: 20, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return err("FORBIDDEN", "Multi-agent refactor jobs are in admin preview.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const message = parsed.data.message.trim();

  const jobId = await enqueueJob({
    workspaceId: g.ws.id,
    userId: g.user.id,
    prompt: message,
    kind: "refactor",
    steps: [{ kind: "plan", message, label: "Plan" }],
    devOrigin: reqOrigin(req),
  });

  return ok({ id: jobId, status: "queued" });
}
