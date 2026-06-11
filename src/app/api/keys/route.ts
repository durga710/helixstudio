import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { BYOK_COOKIE } from "@/lib/byok";

export const dynamic = "force-dynamic";

/* Bring-your-own-key (BYOK): the user's Anthropic API key lives in an
 * httpOnly cookie in their own browser — sent per request, used transiently,
 * never persisted or logged server-side. */

const keySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^sk-ant-[A-Za-z0-9_-]{10,250}$/, "That doesn't look like an Anthropic API key (sk-ant-…)"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    byok: Boolean(req.cookies.get(BYOK_COOKIE)?.value),
    platformKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = keySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid API key" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ byok: true });
  res.cookies.set(BYOK_COOKIE, parsed.data.apiKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const res = NextResponse.json({ byok: false });
  res.cookies.set(BYOK_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
