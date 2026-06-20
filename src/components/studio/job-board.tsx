"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, CircleDashed, AlertCircle, ClipboardList, Wrench, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BoardStep {
  kind: string;
  label: string;
  scope: string[];
  state: "done" | "error" | "running" | "pending";
  summary?: string;
}
interface BoardData {
  status: string;
  kind: string;
  steps: BoardStep[];
  written: string[];
  deleted: string[];
  tokensSpent?: number;
  error?: string;
}

const TERMINAL = new Set(["done", "error", "canceled"]);

function StepIcon({ kind }: { kind: string }) {
  if (kind === "plan") return <ClipboardList className="h-3.5 w-3.5" />;
  if (kind === "review") return <ShieldCheck className="h-3.5 w-3.5" />;
  return <Wrench className="h-3.5 w-3.5" />;
}

function StateDot({ state }: { state: BoardStep["state"] }) {
  if (state === "done") return <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2.5} />;
  if (state === "error") return <AlertCircle className="h-3.5 w-3.5 text-bad" />;
  if (state === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />;
  return <CircleDashed className="h-3.5 w-3.5 text-txt3" />;
}

/** Live board for a durable multi-agent job: polls status until terminal. */
export function JobBoard({ workspaceId, jobId }: { workspaceId: string; jobId: string }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [canceling, setCanceling] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/workspaces/${workspaceId}/jobs/${jobId}`);
        const j = (await r.json()) as { data?: BoardData };
        if (alive.current && j.data) {
          setData(j.data);
          if (TERMINAL.has(j.data.status)) return; // stop polling
        }
      } catch {
        /* transient — keep polling */
      }
      if (alive.current) timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [workspaceId, jobId]);

  async function cancel() {
    setCanceling(true);
    await fetch(`/api/workspaces/${workspaceId}/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
  }

  const status = data?.status ?? "queued";
  const terminal = TERMINAL.has(status);
  const changed = (data?.written.length ?? 0) + (data?.deleted.length ?? 0);

  return (
    <div className="mt-1.5 rounded-xl border border-border bg-panel2/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="label-tactical text-[10px]">Multi-agent job</span>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            status === "done" && "bg-ok/15 text-ok",
            status === "error" && "bg-bad/15 text-bad",
            status === "canceled" && "bg-panel text-txt3",
            !terminal && "bg-accent/15 text-accent",
          )}
        >
          {status}
        </span>
        {!terminal && (
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={canceling}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-txt3 transition-colors hover:text-bad disabled:opacity-50"
          >
            <X className="h-3 w-3" /> {canceling ? "canceling…" : "cancel"}
          </button>
        )}
      </div>

      {!data ? (
        <p className="flex items-center gap-2 px-1 py-1 text-[12px] text-txt3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> starting…
        </p>
      ) : data.steps.length === 0 ? (
        <p className="px-1 py-1 text-[12px] text-txt3">Planning…</p>
      ) : (
        <ul className="space-y-1">
          {data.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <span className="mt-[1px] shrink-0">
                <StateDot state={s.state} />
              </span>
              <span className="shrink-0 text-txt3">
                <StepIcon kind={s.kind} />
              </span>
              <span className="min-w-0">
                <span className={cn("text-txt2", s.state === "running" && "text-txt")}>{s.label}</span>
                {s.scope.length > 0 && (
                  <span className="ml-1 font-mono text-[10px] text-txt3">{s.scope.join(", ")}</span>
                )}
                {s.summary && s.state !== "pending" && (
                  <span className="block text-[11px] text-txt3">{s.summary}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(terminal || (data?.tokensSpent ?? 0) > 0) && (
        <p className="mt-2 border-t border-border/60 pt-2 text-[11px] text-txt3">
          {terminal
            ? status === "done"
              ? `Done — ${changed} file${changed === 1 ? "" : "s"} changed`
              : status === "canceled"
                ? "Canceled."
                : data?.error || "The job hit an error."
            : "Working…"}
          {(data?.tokensSpent ?? 0) > 0 && ` · ~${Math.round((data!.tokensSpent ?? 0) / 1000)}K tokens`}
        </p>
      )}
    </div>
  );
}
