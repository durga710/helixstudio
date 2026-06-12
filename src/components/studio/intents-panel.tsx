/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount + refetch-on-change, same pattern as the studio's other data panels */
"use client";

/**
 * Intents tab: the workspace's change timeline — one entry per idea (agent
 * build turn, manual save, applied undo) with its file set, reasoning, and
 * the per-intent "Undo" entry point into intentional undo.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Markdown } from "@/components/ui/markdown";
import { kindMeta } from "@/components/studio/ledger-panel";

export interface IntentRowDto {
  id: string;
  kind: string;
  status: string;
  title: string;
  userRequest: string;
  reasoning: string | null;
  revertsIntentId: string | null;
  createdAt: string;
  paths: string[];
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export function IntentsPanel({
  workspaceId,
  isOwner,
  refreshKey,
  onUndo,
}: {
  workspaceId: string;
  isOwner: boolean;
  /** Bump to refetch (AI/manual/undo changes landed). */
  refreshKey: number;
  onUndo: (intent: { id: string; title: string }) => void;
}) {
  const [intents, setIntents] = useState<IntentRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/intents`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) setError(json?.error?.message ?? "Couldn't load the change history.");
      else setIntents(json.data.intents);
    } catch {
      setError("Couldn't load the change history.");
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <History className="h-3.5 w-3.5 text-accent" />
        <span className="truncate font-mono text-[11px] text-txt2">
          {intents ? `${intents.length} recorded change(s)` : "change history"}
        </span>
        <button
          type="button"
          aria-label="Reload history"
          title="Reload history"
          onClick={() => void load()}
          className="ml-auto text-txt3 transition-colors hover:text-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && !intents ? (
        <div className="grid flex-1 place-items-center text-sm text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> loading history…
          </span>
        </div>
      ) : error ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-sm text-warn">{error}</div>
      ) : !intents || intents.length === 0 ? (
        <div className="grid flex-1 place-items-center bg-codebg px-6 text-center">
          <div>
            <History className="mx-auto mb-3 h-8 w-8 text-txt3" />
            <p className="text-sm text-txt2">No recorded changes yet</p>
            <p className="mt-1 max-w-sm text-xs text-txt3">
              Every AI build turn and manual save from now on becomes a ledger entry you can inspect — and
              undo as one idea.
            </p>
          </div>
        </div>
      ) : (
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto p-3">
          <ul className="mx-auto max-w-3xl space-y-2">
            {intents.map((intent) => {
              const meta = kindMeta(intent.kind);
              const Icon = meta.icon;
              const expanded = open === intent.id;
              const reverted = intent.status === "reverted";
              return (
                <li
                  key={intent.id}
                  className={cn(
                    "rounded-card-sm border border-border bg-panel px-3 py-2.5",
                    reverted && "opacity-70",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : intent.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-txt3" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-txt3" />
                      )}
                      <Icon className="h-3.5 w-3.5 shrink-0 text-txt3" />
                      <span
                        className={cn(
                          "min-w-0 truncate text-[13px] font-medium text-txt",
                          reverted && "line-through",
                        )}
                      >
                        {intent.title || "(untitled change)"}
                      </span>
                    </button>
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                    {reverted && <Pill tone="red">reverted</Pill>}
                    <span className="shrink-0 text-[11px] text-txt3" title={new Date(intent.createdAt).toLocaleString()}>
                      {relativeTime(intent.createdAt)}
                    </span>
                    <span className="shrink-0 text-[11px] text-txt3">
                      {intent.paths.length} file{intent.paths.length === 1 ? "" : "s"}
                    </span>
                    {isOwner && !reverted && (
                      <Button
                        variant="mini"
                        onClick={() => onUndo({ id: intent.id, title: intent.title })}
                        title="Revert this idea — code, files, everything it introduced"
                        className="shrink-0"
                      >
                        <Undo2 className="h-3 w-3" /> Undo
                      </Button>
                    )}
                  </div>

                  {expanded && (
                    <div className="mt-2 space-y-2 border-t border-border pt-2 text-[12.5px] leading-relaxed">
                      {intent.kind !== "manual" && intent.userRequest && (
                        <div>
                          <div className="label-tactical mb-1 text-[10px]">Request</div>
                          <p className="whitespace-pre-wrap text-txt2">{intent.userRequest}</p>
                        </div>
                      )}
                      {intent.reasoning && (
                        <div>
                          <div className="label-tactical mb-1 text-[10px]">Agent&apos;s summary</div>
                          <div className="text-txt2">
                            <Markdown content={intent.reasoning} />
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="label-tactical mb-1 text-[10px]">Files touched</div>
                        <ul className="space-y-0.5 font-mono text-[11px] text-txt2">
                          {intent.paths.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
