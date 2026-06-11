import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { HELIX_SYSTEM_PROMPT, streamCompletion } from "@/lib/ai/provider";
import { BYOK_COOKIE } from "@/lib/byok";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(32_000),
      })
    )
    .min(1)
    .max(60),
  tier: z.enum(["haiku", "sonnet", "opus"]).default("opus"),
  depth: z.enum(["fast", "deep"]).default("deep"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, tier, depth } = parsed.data;
  // BYOK: the user's own Anthropic key, sent via httpOnly cookie. Used
  // transiently for this request only — never persisted or logged.
  const userKey = req.cookies.get(BYOK_COOKIE)?.value || undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamCompletion({
          messages,
          system: HELIX_SYSTEM_PROMPT,
          tier,
          depth,
          apiKey: userKey,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
          controller.enqueue(
            encoder.encode("\n\n[Your Anthropic API key was rejected — update it in Settings → AI provider.]")
          );
        } else if (error instanceof Anthropic.RateLimitError) {
          controller.enqueue(encoder.encode("\n\n[Anthropic rate limit hit — wait a moment and try again.]"));
        } else {
          controller.enqueue(encoder.encode("\n\n[Helix hit a provider error — try again.]"));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
