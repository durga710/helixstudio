import { NextRequest } from "next/server";
import { dbEnabled, db, schemaReady } from "@/lib/db";
import { readVerifyToken } from "@/lib/email-verify";
import { appOrigin } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/* The link in the verification email. Confirms the token, marks the account
 * verified, and bounces to the login page with a banner. GET so it works
 * straight from an email client. */
export async function GET(req: NextRequest) {
  const base = appOrigin(req);
  const fail = () => Response.redirect(`${base}/login?verifyerror=1`, 302);

  if (!dbEnabled()) return fail();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claim = readVerifyToken(token);
  if (!claim) return fail();

  try {
    await schemaReady();
    const user = await db().user.findUnique({ where: { id: claim.uid }, select: { id: true, email: true, emailVerified: true } });
    // Token must match the account's CURRENT email (a later email change voids it).
    if (!user || (user.email ?? "").toLowerCase() !== claim.email) return fail();
    if (!user.emailVerified) {
      await db().user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    }
    return Response.redirect(`${base}/login?verified=1`, 302);
  } catch {
    return fail();
  }
}
