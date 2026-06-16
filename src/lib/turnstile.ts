import "server-only";

/**
 * Cloudflare Turnstile (CAPTCHA) verification — bot protection for signup and
 * forgot-password. Graceful: if TURNSTILE_SECRET_KEY isn't set, verification is
 * skipped (returns true), so nothing breaks until you wire the keys. Client
 * widget renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function captchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** True if the challenge passed (or CAPTCHA isn't configured). */
export async function verifyTurnstile(token: string | undefined | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → don't block
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
