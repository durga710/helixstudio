/**
 * Delete-storm guard — stop a single turn from deleting a large fraction of the
 * project. A weak engine model, when it can't resolve an error, sometimes starts
 * deleting files to "fix" it — in one observed run it removed ~20 files (the
 * layout, every route page, half the components) chasing a one-line import bug,
 * destroying the app. Phase-1 fixers remove the most common trigger, but this is
 * the deterministic backstop for every other thrash.
 *
 * Policy: a turn may delete up to `max(ABS_FLOOR, ceil(FRACTION × project size))`
 * files. Legitimate refactors (rename a directory, drop a feature) stay well
 * under it; "delete the whole app" trips it. Pure + deterministic; the caller
 * surfaces `reason` to the model so it course-corrects instead of looping.
 */

/** Always allow at least this many deletes regardless of project size (small
 * projects legitimately churn a few files). */
export const DELETE_ABS_FLOOR = 12;
/** Beyond this fraction of the project in one turn, deletion is almost always a runaway. */
export const DELETE_FRACTION = 0.5;

export interface DeleteGuardState {
  /** File count at the start of the turn (before any of this turn's writes/deletes). */
  treeSizeAtStart: number;
  /** Files this turn has already deleted. */
  deletedThisTurn: number;
}

export interface DeleteGuardVerdict {
  allowed: boolean;
  reason?: string;
}

/** The per-turn deletion cap for a project of `treeSizeAtStart` files. */
export function deleteCap(treeSizeAtStart: number): number {
  return Math.max(DELETE_ABS_FLOOR, Math.ceil(DELETE_FRACTION * Math.max(0, treeSizeAtStart)));
}

/**
 * Decide whether deleting `deletingCount` more file(s) this turn is allowed.
 * Returns a model-facing `reason` when blocked, steering it to fix the error
 * rather than delete the project.
 */
export function checkDeleteStorm(state: DeleteGuardState, deletingCount = 1): DeleteGuardVerdict {
  const cap = deleteCap(state.treeSizeAtStart);
  const total = state.deletedThisTurn + deletingCount;
  if (total <= cap) return { allowed: true };
  return {
    allowed: false,
    reason:
      `Refusing to delete ${total} files in a single turn (the project has ${state.treeSizeAtStart}). ` +
      `Mass deletion is almost never the right fix — if the build is failing, correct the actual error ` +
      `(fix the import path/case, add the missing export, repair the syntax) instead of removing files. ` +
      `If the user genuinely asked to remove a large feature, do it in smaller, deliberate steps.`,
  };
}
