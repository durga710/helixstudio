/**
 * Tunable limits for durable multi-agent jobs (pure constants — safe to import
 * anywhere). Adjust here rather than hunting through the runner.
 */

/** Max workers running at once (model rate-limit + token-spend guard). */
export const WORKER_CONCURRENCY = 3;

/** Hard ceiling on total tokens a single job may spend across all slices.
 * The per-worker budget check (checkTokenBudget) still applies first; this caps
 * a runaway multi-slice job even for an admin with a large quota. */
export const JOB_TOKEN_CAP = 3_000_000;

/** Minimum project size (file count) to bother with the multi-agent JOB path.
 * Below this, a single normal build turn is far cheaper than planner + parallel
 * workers + reviewer — so we DON'T offer/route a job for small projects. The
 * 700K-tokens-for-3-files case was exactly this mis-route. */
export const JOB_MIN_FILES = 12;
