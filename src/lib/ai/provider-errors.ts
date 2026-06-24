/**
 * Generic provider-error branding for the AI agent/chat surface — the
 * coding-tool analogue of video-errors.ts. Maps raw provider/billing/rate-limit
 * text to product-neutral messages so users never see "Anthropic", "OpenAI",
 * "Bedrock", "billing", "quota", an API-key signature, etc.
 *
 * Crucially this is CONSERVATIVE: only strings that look like a provider/billing
 * leak are rewritten. A genuine app-level message (e.g. "Nothing to push",
 * "Your changes conflict…") is passed through unchanged so we don't bury useful
 * guidance behind a generic error. Pure + dependency-free (node-test-able).
 */

/** Surface signatures that must never reach a user, even mid-sentence. */
const PROVIDER_SIGNATURE = /anthropic|openai|bedrock|\bgpt\b|\bsora\b|x-api-key|insufficient_quota|claude-|gpt-/i;

/** Brand a raw agent/provider error. Returns a safe, product-neutral message
 * for known provider/billing leaks; otherwise returns the original text. */
export function brandProviderError(raw: string | undefined): string {
  const original = (raw ?? "").trim();
  if (!original) return "The AI service hit a problem — please try again.";
  const m = original.toLowerCase();

  if (/billing|quota|hard limit|insufficient|exceeded your current|out of|payment|credit|balance/.test(m))
    return "The AI service is temporarily at capacity. Please try again later.";
  if (/rate limit|too many requests|429/.test(m))
    return "The AI service is busy right now — please try again in a moment.";
  if (/content policy|moderation|safety|flagged|not allowed|violat/.test(m))
    return "That request couldn't be processed. Try rephrasing your prompt.";
  if (/api key|unauthorized|authentication|401|403/.test(m))
    return "The configured AI provider key was rejected. Check your provider settings.";

  // Anything still carrying a raw provider/SDK signature is replaced wholesale.
  if (PROVIDER_SIGNATURE.test(original)) return "The AI service hit a problem — please try again.";

  // Looks like a genuine app-level message — safe to show as-is.
  return original;
}
