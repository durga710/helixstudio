import "server-only";

/**
 * Transient-error retry for provider calls. Rate limits (429), overloaded
 * (Anthropic 529), and 5xx are worth one or two backed-off retries instead of
 * failing the whole turn; 4xx like 401/400 are not (they won't fix themselves).
 */

const RETRYABLE = new Set([429, 500, 502, 503, 529]);

export function isRetryableStatus(s: number | undefined | null): boolean {
  return s != null && RETRYABLE.has(s);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying on transient HTTP status with exponential backoff.
 * `getStatus` pulls a status off a thrown error (default: `.status`, which the
 * OpenAI/Anthropic SDKs set). For raw fetch (status, not a throw), check the
 * status yourself and throw a `{ status }` to opt into the retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseMs?: number; getStatus?: (e: unknown) => number | undefined } = {},
): Promise<T> {
  const tries = opts.tries ?? 3;
  const baseMs = opts.baseMs ?? 600;
  const getStatus = opts.getStatus ?? ((e) => (e as { status?: number }).status);
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === tries - 1 || !isRetryableStatus(getStatus(e))) throw e;
      await sleep(baseMs * 2 ** i); // 600ms, 1.2s, …
    }
  }
  throw last;
}
