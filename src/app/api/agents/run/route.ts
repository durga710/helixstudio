import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { PIPELINE_STEPS, runStep, type PipelineStep } from "@/lib/agents/pipeline";
import { addActivity } from "@/lib/store";
import { BYOK_COOKIE } from "@/lib/byok";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const step = req.nextUrl.searchParams.get("step") as PipelineStep | null;
  if (!step || !PIPELINE_STEPS.includes(step)) {
    return Response.json({ error: "Unknown pipeline step" }, { status: 400 });
  }

  const apiKey = req.cookies.get(BYOK_COOKIE)?.value || process.env.ANTHROPIC_API_KEY || undefined;

  // Build workspace context from real DB if a workspace ID is provided.
  let context: string | undefined;
  const workspaceId = req.nextUrl.searchParams.get("w");
  if (workspaceId && dbEnabled()) {
    try {
      const ws = await db().workspace.findFirst({
        where: { id: workspaceId, userId: session.user.id },
        select: { id: true, name: true },
      });
      if (ws) {
        const { buildWorkspaceContext } = await import("@/lib/repo/load-sources");
        context = await buildWorkspaceContext(ws.id, ws.name);
      }
    } catch {
      // Fall through to demo context
    }
  }

  if (step === PIPELINE_STEPS[PIPELINE_STEPS.length - 1]) {
    addActivity({ kind: "task", text: "Agent workflow completed for", highlight: "workspace" });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runStep(step, apiKey, context)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
