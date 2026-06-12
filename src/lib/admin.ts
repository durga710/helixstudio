import "server-only";

/**
 * Access control for the /admin overview. Admins are listed in the
 * ADMIN_EMAILS env var (comma-separated). When it's unset we allow any
 * signed-in user in NON-production only (local dev convenience) and deny in
 * production — so a fresh prod deploy never exposes the page until an
 * allowlist is set deliberately.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const list = adminEmails();
  // No allowlist set: dev convenience for any signed-in user; never anonymous,
  // never in production.
  if (list.length === 0) return process.env.NODE_ENV !== "production" && Boolean(email);
  return Boolean(email && list.includes(email.toLowerCase()));
}
