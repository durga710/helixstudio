"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Hammer, Play } from "lucide-react";

/* Godot Build & Play, self-contained for the editor's game mode. Godot projects
 * compile on demand (no live srcDoc preview): POST the build route, stream its
 * NDJSON log, then play the fresh .pck in an iframe of /play/[id]. Lifted from
 * build-studio.tsx so /editor and /build share the exact same behavior. */

export function GodotPlayPanel({ workspaceId }: { workspaceId: string }) {
  const [status, setStatus] = useState<"none" | "exporting" | "ready" | "error">("none");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/godot/build`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      setStatus(json.data.status ?? "none");
      setBuildId(json.data.buildId ?? null);
      if (json.data.error) setError(json.data.error);
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set post-await
    void refreshStatus();
  }, [refreshStatus]);

  const buildAndPlay = useCallback(async () => {
    if (building) return;
    setBuilding(true);
    setStatus("exporting");
    setError(null);
    setLog(["Starting the build…"]);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/godot/build`, { method: "POST" });
      if (!res.body) throw new Error("The build couldn't start.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let id: string | null = null;
      let ok = false;
      let errMsg: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { type: string; line?: string; ok?: boolean; buildId?: string; error?: string };
            if (evt.type === "log" && evt.line) setLog((prev) => [...prev, evt.line!]);
            else if (evt.type === "done") {
              ok = Boolean(evt.ok);
              id = evt.buildId ?? null;
              errMsg = evt.error ?? null;
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }
      if (ok) {
        setStatus("ready");
        if (id) setBuildId(id);
      } else {
        setStatus("error");
        setError(errMsg ?? "The build failed.");
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "The build failed.");
    } finally {
      setBuilding(false);
    }
  }, [workspaceId, building]);

  if (status === "ready" && buildId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#0b0f1a]">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg2 px-3 py-1.5">
          <span className="text-[11.5px] text-txt3">Compiled game · Godot</span>
          <button
            onClick={() => void buildAndPlay()}
            disabled={building}
            className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50"
          >
            {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
            Rebuild &amp; Play
          </button>
        </div>
        <iframe
          key={buildId}
          title="Play"
          src={`/play/${workspaceId}?b=${buildId}`}
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          className="min-h-0 w-full flex-1 border-0 bg-black"
        />
      </div>
    );
  }

  return (
    <div className="grid flex-1 place-items-center bg-[#0b0f1a] p-8">
      <div className="w-full max-w-[460px] text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand-cyan,#00ffd1)] via-accent to-[#c084fc]">
          <Play className="h-6 w-6 text-white" fill="currentColor" />
        </div>
        <div className="mt-4 text-[14px] font-semibold">{building ? "Compiling your game…" : "Ready to compile"}</div>
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">
          This is a real Godot project. Press Build &amp; Play to compile it and run it right here.
        </div>
        <button
          onClick={() => void buildAndPlay()}
          disabled={building}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[11px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}
          {building ? "Building…" : "Build & Play"}
        </button>
        {error && !building && (
          <div className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-3 py-2 text-[12px] text-[#fca5a5]">
            {error}
          </div>
        )}
        {(building || log.length > 1) && (
          <pre className="scroll-area mt-4 max-h-[200px] overflow-auto rounded-[10px] border border-border bg-[#070b12] p-3 text-left font-mono text-[11px] leading-[1.5] text-txt2">
            {log.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
