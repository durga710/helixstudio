import { NextRequest } from "next/server";
import { z } from "zod";
import { dbEnabled, db, schemaReady } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

/* Account creation (real users — requires DATABASE_URL). */

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return Response.json(
      { error: "Account creation needs the database — it isn't connected yet." },
      { status: 503 }
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
