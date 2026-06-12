import "server-only";

/**
 * Live "what is the AI doing right now" channel. The chat turn publishes a
 * label per step (real tool activity, not theatre); the client polls it
 * while the turn runs. In-memory — perfect for the single-process dev/self-
 * host setup this app targets.
 */

const globalForProgress = globalThis as unknown as {
  helixProgress?: Map<string, { label: string; at: number }>;
};
const progress = (globalForProgress.helixProgress ??= new Map());

export function setProgress(workspaceId: string, label: string) {
  progress.set(workspaceId, { label, at: Date.now() });
}

export function getProgress(workspaceId: string): string | null {
  const p = progress.get(workspaceId);
  if (!p || Date.now() - p.at > 5 * 60_000) return null;
  return p.label;
}

export function clearProgress(workspaceId: string) {
  progress.delete(workspaceId);
}
