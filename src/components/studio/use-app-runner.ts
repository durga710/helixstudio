/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount/poll effects set state after async work by design (extracted from workspace-panel) */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Live status of the framework-app dev server (local in dev, cloud VM hosted). */
export interface RunInfo {
  status: "exporting" | "installing" | "starting" | "running" | "stopped" | "error";
  framework: string;
  url: string | null;
  port: number | null;
  reachable: boolean;
  logs: string[];
}

/**
 * Framework-app runner: fetch/start/stop the dev server and poll while it boots
 * (install → start → reachable). State lives in the hook, but the hook is called
 * unconditionally from WorkspacePanel, so `run` persists across tab switches
 * exactly as it did when this lived inline.
 */
export function useAppRunner({
  workspaceId,
  isFrameworkApp,
  tab,
  onNote,
}: {
  workspaceId: string;
  isFrameworkApp: boolean;
  tab: string;
  onNote: (msg: string) => void;
}) {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const refreshRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/run`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setRun(json.data);
    } catch {
      // next poll will catch up
    }
  }, [workspaceId]);

  const startApp = useCallback(async () => {
    if (runBusy) return;
    setRunBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/run`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setRun(json.data);
      else onNote(json?.error?.message ?? "Couldn't start the app.");
    } catch {
      onNote("Couldn't start the app.");
    }
    setRunBusy(false);
  }, [runBusy, workspaceId, onNote]);

  const stopApp = useCallback(async () => {
    if (runBusy) return;
    setRunBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/run`, { method: "DELETE" });
      // Only clear the run UI when the stop actually succeeded — otherwise the
      // app keeps running (and billing the VM) while we'd falsely show "stopped".
      if (res.ok) setRun(null);
      else onNote("Couldn't stop the app — it may still be running.");
    } catch {
      onNote("Couldn't reach the server — the app may still be running.");
    }
    setRunBusy(false);
  }, [runBusy, workspaceId, onNote]);

  // Check for an existing run when entering the preview tab.
  useEffect(() => {
    if (tab !== "preview" || !isFrameworkApp) return;
    void refreshRun();
  }, [tab, isFrameworkApp, refreshRun]);

  // Poll while the app is coming up (install → start → reachable).
  useEffect(() => {
    if (tab !== "preview" || !run) return;
    const busy =
      run.status === "exporting" ||
      run.status === "installing" ||
      run.status === "starting" ||
      (run.status === "running" && !run.reachable);
    if (!busy) return;
    const t = setInterval(() => void refreshRun(), 2500);
    return () => clearInterval(t);
  }, [tab, run, refreshRun]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run?.logs?.length]);

  return { run, runBusy, startApp, stopApp, logsEndRef };
}
