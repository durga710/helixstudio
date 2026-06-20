import { NextRequest } from "next/server";
import { z } from "zod";
import { dbEnabled, db, schemaReady } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/password";
import { readResetUid, verifyResetToken } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

/* Complete a password reset: validate the single-use token, set the new
 * password. The token is bound to the user's current hash, so it stops working
 * the instant the password changes (can't be replayed). */

const schema = z.object({
  token: z.string().min(1).max(2000),
  password: z.string().min(8).max(200),
});

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim() : "unknown";
}

export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return Response.json({ error: "Password reset needs the database." }, { status: 503 });
  }

  const rl = await rateLimit(`reset:${clientIp(req)}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.success) {
    return Response.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "retry-after": String(Math.ceil((rl.reset - Date.now()) / 1000)) } },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const uid = readResetUid(token);
  if (!uid) return Response.json({ error: "This reset link is invalid." }, { status: 400 });

  await schemaReady();
  const user = await db().user.findUnique({ where: { id: uid }, select: { id: true, passwordHash: true } });
  if (!user || !verifyResetToken(token, user)) {
    return Response.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  await db().user.update({ where: { id: uid }, data: { passwordHash: hashPassword(password) } });
  return Response.json({ ok: true });
}
