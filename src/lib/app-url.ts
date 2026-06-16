import "server-only";

/**
 * The canonical public origin for links we put in EMAILS (password reset, etc.).
 *
 * SECURITY: never derive this from request headers in production. With
 * `trustHost: true` an attacker can send a spoofed Host / X-Forwarded-Host, and
 * if we used it to build a reset link the email would point the one-time token at
 * an attacker-controlled domain (host-header injection → account takeover). So we
 * only ever trust an explicitly-configured origin in production, falling back to
 * the known canonical domain — request-derived origins are allowed in dev only.
 */
const CANONICAL = "https://helixstudio.org";

export function appOrigin(req?: Request): string {
  const configured = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production" && req) {
    try {
      return new URL(req.url).origin;
    } catch {
      /* fall through */
    }
  }
  return CANONICAL;
}
