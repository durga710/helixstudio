import { auth } from "@/lib/auth";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const BUILD_LOG: Array<{ tone: "dim" | "ok" | "warn"; text: string; delay: number }> = [
  { tone: "dim", text: "$ next build", delay: 200 },
  { tone: "ok", text: "✓ Compiled successfully in 18.3s", delay: 900 },
  { tone: "dim", text: "▲ Collecting page data …", delay: 600 },
  { tone: "dim", text: "▲ Generating static pages (42/42)", delay: 800 },
  { tone: "warn", text: "⚠ next-auth@5.0.0-beta — pre-release in production", delay: 400 },
  { tone: "dim", text: "▲ Running Security agent pre-deploy scan …", delay: 700 },
  { tone: "ok", text: "✓ 0 secrets leaked · 0 injection risks", delay: 600 },
  { tone: "dim", text: "▲ Uploading build outputs …", delay: 900 },
  { tone: "ok", text: "✓ Deployment ready", delay: 500 },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const line of BUILD_LOG) {
          await new Promise((r) => setTimeout(r, line.delay));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
        }
        // Mark the preview environment ready once the simulated build finishes.
        const preview = store().environments.find((e) => e.id === "preview");
        if (preview) preview.state = "ready";
        const building = store().deployments.find((d) => d.state === "building");
        if (building) building.state = "ready";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tone: "done", text: "" })}\n\n`));
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
