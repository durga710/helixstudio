/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount/poll effects set state after async work by design (extracted from workspace-panel) */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** One changed file in the workspace overlay vs. the base branch. */
export interface DiffEntry {
  path: string;
  status: "added" | "modified" | "deleted";
  base: string;
  current: string;
}

/**
 * Diff tab state: pending workspace changes vs the base branch, plus the
 * AI "Review changes" result. Called unconditionally from WorkspacePanel so the
 * diff refetches when the tab opens or new changes land — same as inline.
 */
export function useWorkspaceDiff({
  workspaceId,
  tab,
  changesNonce,
}: {
  workspaceId: string;
  tab: string;
  changesNonce?: number;
}) {
  const [diffEntries, setDiffEntries] = useState<DiffEntry[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffSelected, setDiffSelected] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const loadDiff = useCallback(async () => {
    setDiffLoading(true);
    setDiffError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/diff`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setDiffError(json?.error?.message ?? "Couldn't load the diff.");
      } else {
        const entries = (json.data.entries ?? []) as DiffEntry[];
        setDiffEntries(entries);
        setDiffSelected((sel) =>
          sel && entries.some((e) => e.path === sel) ? sel : (entries[0]?.path ?? null),
        );
      }
    } catch {
      setDiffError("Couldn't load the diff.");
    }
    setDiffLoading(false);
  }, [workspaceId]);

  // Fetch the diff whenever the tab opens or AI/manual changes land while open.
  useEffect(() => {
    if (tab !== "diff") return;
    void loadDiff();
  }, [tab, loadDiff, changesNonce]);

  const runReview = useCallback(async () => {
    if (reviewing) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/review`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) setReview(json?.error?.message ?? "Review failed.");
      else setReview(json.data.text);
    } catch {
      setReview("Review failed.");
    }
    setReviewing(false);
  }, [reviewing, workspaceId]);

  const diffSelectedEntry = useMemo(
    () => diffEntries?.find((e) => e.path === diffSelected) ?? null,
    [diffEntries, diffSelected],
  );

  return {
    diffEntries,
    diffLoading,
    diffError,
    diffSelected,
    setDiffSelected,
    diffSelectedEntry,
    review,
    setReview,
    reviewing,
    loadDiff,
    runReview,
  };
}
