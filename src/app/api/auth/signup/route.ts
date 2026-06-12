import { NextRequest } from "next/server";
import { z } from "zod";
import { dbEnabled, db, schemaReady } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/* Account creation (real users — requires DATABASE_URL). */

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
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

  const { name, email, password } = parsed.data;
  await schemaReady();
  const existing = await db().user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  await db().user.create({
    data: { name, email, passwordHash: hashPassword(password) },
  });
  return Response.json({ ok: true }, { status: 201 });
}
