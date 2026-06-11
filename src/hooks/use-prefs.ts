"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModelTier, ReasoningDepth } from "@/lib/ai/provider";

/* Workspace preferences (Phase 5 — user memory). Persisted in localStorage so
 * they survive sessions; mirrored by the MemoryEntry models in Prisma for
 * server-side persistence when a database is connected. */

export interface Prefs {
  model: ModelTier;
  depth: ReasoningDepth;
  confirmActions: boolean;
  fullWorkflow: boolean;
  autoSecurity: boolean;
}

const DEFAULTS: Prefs = {
  model: "opus",
  depth: "deep",
  confirmActions: true,
  fullWorkflow: true,
  autoSecurity: true,
};

const KEY = "helix_prefs";

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-hydration sync with localStorage; SSR can't read it
    setPrefs(read());
  }, []);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // non-persistent storage — prefs apply for this session only
      }
      return next;
    });
  }, []);

  return { prefs, update };
}

export const MODEL_LABELS: Record<ModelTier, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

export const DEPTH_LABELS: Record<ReasoningDepth, string> = {
  fast: "Fast",
  deep: "Deep",
};
