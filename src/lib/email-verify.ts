/**
 * Stateless email-verification tokens — same HMAC scheme as password reset, but
 * purpose-tagged ("verify") so a reset token can never be replayed as a verify
 * token or vice-versa. Bound to the user id + email; 24-hour expiry. No DB table.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function signingKey(): string {
  return `verify:${process.env.AUTH_SECRET ?? "helix-verify-fallback-secret"}`;
}

export function makeVerifyToken(user: { id: string; email: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: user.id, em: user.email.toLowerCase(), exp: Date.now() + TTL_MS }),
  ).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Returns the verified user id (+ email) if the token is well-formed, unexpired,
 * and correctly signed; otherwise null. */
export function readVerifyToken(token: string): { uid: string; email: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let data: { uid?: unknown; em?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof data.uid !== "string" || typeof data.em !== "string") return null;
  if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return { uid: data.uid, email: data.em };
}
