/**
 * Stateless, single-use password-reset tokens — no DB table needed.
 *
 * A token is `<payload>.<hmac>` where payload = base64url({ uid, exp }) and the
 * HMAC key is `AUTH_SECRET : user.passwordHash`. Binding the signature to the
 * CURRENT password hash makes it single-use for free: the moment the password is
 * reset (hash changes) every previously-issued token stops verifying. Tokens
 * also carry a 1-hour expiry. Forging one needs AUTH_SECRET, which never leaves
 * the server.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 60 * 60 * 1000; // 1 hour

function signingKey(passwordHash: string): string {
  return `${process.env.AUTH_SECRET ?? "helix-reset-fallback-secret"}:${passwordHash}`;
}

export function makeResetToken(user: { id: string; passwordHash: string }): string {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", signingKey(user.passwordHash)).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** The user id a token claims to be for (unverified — just to look the user up). */
export function readResetUid(token: string): string | null {
  const payload = token.split(".")[0];
  if (!payload) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: unknown };
    return typeof data.uid === "string" ? data.uid : null;
  } catch {
    return null;
  }
}

/** True only if the token is well-formed, unexpired, and signed for THIS user's
 * current password hash (so it hasn't already been used to change the password). */
export function verifyResetToken(token: string, user: { id: string; passwordHash: string | null }): boolean {
  if (!user.passwordHash) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  let data: { uid?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return false;
  }
  if (data.uid !== user.id) return false;
  if (typeof data.exp !== "number" || data.exp < Date.now()) return false;
  const expected = createHmac("sha256", signingKey(user.passwordHash)).update(payload).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return false;
  }
  return expected.length === got.length && timingSafeEqual(expected, got);
}
