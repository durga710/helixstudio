import { NextRequest } from "next/server";
import { z } from "zod";
import { dbEnabled, db, schemaReady } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { makeResetToken } from "@/lib/password-reset";
import { sendEmail, passwordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/* Request a password-reset link. ALWAYS responds {ok:true} regardless of whether
 * the email maps to a real (password) account — never reveal which addresses
 * exist. In dev (no email provider) the link is returned so it's testable. */

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim() : "unknown";
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  // No DB → no accounts; respond generically so behaviour can't be probed.
  if (!dbEnabled()) return Response.json({ ok: true });

  const rl = await rateLimit(`forgot:${clientIp(req)}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.success) {
    return Response.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "retry-after": String(Math.ceil((rl.reset - Date.now()) / 1000)) } },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  await schemaReady();
  const user = await db().user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });

  // Only password accounts can reset (OAuth-only users have no passwordHash).
  let devLink: string | undefined;
  if (user?.passwordHash) {
    const token = makeResetToken({ id: user.id, passwordHash: user.passwordHash });
    const link = `${originOf(req)}/reset-password?token=${encodeURIComponent(token)}`;
    const mail = passwordResetEmail(link);
    await sendEmail({ to: parsed.data.email, ...mail });
    if (process.env.NODE_ENV !== "production") devLink = link;
  }

  // Identical shape whether or not the account exists (anti-enumeration); devLink
  // is only ever populated off-production.
  return Response.json({ ok: true, ...(devLink ? { devLink } : {}) });
}
