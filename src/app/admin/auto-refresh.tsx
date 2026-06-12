"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Soft-refreshes the admin page on an interval: router.refresh() re-runs the
 * server component (re-querying the DB) and swaps in new data without a full
 * page reload or losing scroll. Pauses while the tab is hidden so a
 * backgrounded dashboard isn't polling the DB for nothing.
 */
export function AdminAutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setRefreshedAt(new Date().toLocaleTimeString());
    };
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-txt3">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
      live · refreshes every {Math.round(intervalMs / 1000)}s
      {refreshedAt ? ` · updated ${refreshedAt}` : ""}
    </span>
  );
}
