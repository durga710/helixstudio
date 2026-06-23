/**
 * HelixVideo error branding. Pure, dependency-free (no server-only, no path
 * aliases) so it's unit-testable in the node test runner. Lives apart from
 * video.ts, which pulls in the OpenAI client and server-only modules.
 *
 * The white-label promise: users never see provider/billing internals. Every
 * raw provider error maps to a branded HelixVideo message. (The OpenAI SDK
 * formats messages like "400 Billing hard limit has been reached." — exactly
 * the kind of string that must not reach a user.)
 */

/** Map a raw provider message (+ optional HTTP status) to a branded message. */
export function brandVideoMessage(raw: string, status: number | undefined, fallback: string): string {
  const m = (raw ?? "").toLowerCase();
  // Operator-side capacity/billing caps — generic "try later", no provider detail.
  if (/billing|quota|hard limit|insufficient|exceeded your current|out of|payment|credit|balance/.test(m))
    return "HelixVideo is temporarily at capacity. Please try again later.";
  if (status === 429 || /rate limit|too many requests/.test(m))
    return "HelixVideo is busy right now — please try again in a moment.";
  // Prompt rejected by safety/moderation.
  if (/content policy|moderation|safety|flagged|rejected|not allowed|violat/.test(m))
    return "That prompt couldn't be used. Try describing a different shot.";
  return fallback;
}

/** Log the real error server-side, return a branded message for the user. */
export function sanitizeVideoError(e: unknown, fallback: string): string {
  console.error("[helixvideo]", e);
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : undefined;
  return brandVideoMessage(raw, status, fallback);
}
