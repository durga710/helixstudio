import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
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

  if (step === PIPELINE_STEPS[PIPELINE_STEPS.length - 1]) {
    addActivity({ kind: "task", text: "Agent workflow completed for", highlight: "acme-web" });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runStep(step, apiKey)) {
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
