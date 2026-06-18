import { NextRequest, after } from "next/server";
import { z } from "zod";
import { dbEnabled, db, schemaReady } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { emailConfigured, sendEmail, verifyEmail } from "@/lib/email";
import { makeVerifyToken } from "@/lib/email-verify";
import { appOrigin } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/* Account creation (real users — requires DATABASE_URL). */

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  turnstileToken: z.string().max(4000).optional(),
});

/** Client IP from the proxy chain (Vercel sets x-forwarded-for). */
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim() : "unknown";
}

export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return Response.json(
      { error: "Account creation needs the database — it isn't connected yet." },
      { status: 503 }
    );
  }

  // Throttle account creation per IP to blunt signup spam / enumeration.
  // Limit is generous on purpose: a whole classroom often signs up at once from
  // one school's shared (NAT) IP, so a tight cap would lock them out. 40/hour
  // still cuts a bot from unlimited to a trickle. (In-memory + per-instance for
  // now; becomes global once the limiter moves to Redis — see docs/AUDIT-2026-06.md.)
  const rl = await rateLimit(`signup:${clientIp(req)}`, { limit: 40, windowMs: 60 * 60 * 1000 });
  if (!rl.success) {
    return Response.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429, headers: { "retry-after": String(Math.ceil((rl.reset - Date.now()) / 1000)) } },
    );
  }

  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sign-up details" },
      { status: 400 }
    );
  }

  const { name, email, password, turnstileToken } = parsed.data;

  // Bot challenge (no-op unless TURNSTILE_SECRET_KEY is set).
  if (!(await verifyTurnstile(turnstileToken, clientIp(req)))) {
    return Response.json({ error: "Couldn't verify you're human — please retry." }, { status: 400 });
  }

  await schemaReady();
  const existing = await db().user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  // Require email verification ONLY when email sending is configured — otherwise
  // we couldn't deliver the link, so auto-verify (account is usable immediately).
  const mustVerify = emailConfigured();

  let created;
  try {
    created = await db().user.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        emailVerified: mustVerify ? null : new Date(),
      },
      select: { id: true, email: true },
    });
  } catch (e) {
    // Lost the race to a concurrent signup with the same email — the unique
    // constraint (P2002) fired. Surface the normal "already exists", not a 500.
    if ((e as { code?: string }).code === "P2002") {
      return Response.json({ error: "An account with that email already exists" }, { status: 409 });
    }
    throw e;
  }

  if (mustVerify && created.email) {
    const token = makeVerifyToken({ id: created.id, email: created.email });
    const link = `${appOrigin(req)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    const mail = verifyEmail(link);
    after(() => sendEmail({ to: created.email!, ...mail }));
  }

  // verify:true tells the client to show "check your email" instead of signing in.
  return Response.json({ ok: true, verify: mustVerify }, { status: 201 });
}
