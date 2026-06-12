"use client";

/**
 * Compact provenance card anchored next to a freshly-changed block in the
 * Code tab. Hovering a highlighted line shows it; clicking pins it. Keeps
 * the info tight: what the change was + when, a short why, and three
 * actions — "Why?" / "If removed?" (grounded AI answers inline) and Undo.
 */

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Undo2, X } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { Markdown } from "@/components/ui/markdown";
import { kindMeta, type LedgerIntentDto } from "@/components/studio/ledger-panel";

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : new Date(iso).toLocaleDateString();
}

export function IntentPopover({
  workspaceId,
  path,
  line,
  intent,
  position,
  pinned,
  isOwner,
  onPin,
  onClose,
  onUndo,
  onMouseEnter,
  onMouseLeave,
}: {
  workspaceId: string;
  path: string;
  line: number;
  intent: LedgerIntentDto;
  /** Wrapper-relative anchor. placeAbove flips the card above the line. */
  position: { top: number; left: number; placeAbove: boolean };
  pinned: boolean;
  isOwner: boolean;
  /** Interacting with the card pins it so it stops auto-hiding. */
  onPin: () => void;
  onClose: () => void;
  onUndo: (intent: { id: string; title: string }) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [asking, setAsking] = useState<"why" | "impact" | null>(null);
  const [answerFor, setAnswerFor] = useState<{
    line: number;
    question: "why" | "impact";
    text: string;
  } | null>(null);
  const answer = answerFor && answerFor.line === line ? answerFor : null;

  // Escape closes a pinned card.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, onClose]);

  async function ask(question: "why" | "impact") {
    if (asking) return;
    onPin();
    setAsking(question);
    setAnswerFor(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ledger/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, line, question }),
      });
      const json = await res.json().catch(() => null);
      setAnswerFor({
        line,
        question,
        text: res.ok && json?.ok ? json.data.text : (json?.error?.message ?? "Couldn't get an answer."),
      });
    } catch {
      setAnswerFor({ line, question, text: "Couldn't get an answer." });
    }
    setAsking(null);
  }

  const meta = kindMeta(intent.kind);
  const Icon = meta.icon;
  const why = (intent.reasoning || intent.userRequest || "").trim();

  return (
    <div
      className="fade-up absolute z-20 w-[330px] rounded-card-lg border border-border2 bg-panel p-3 text-[12px] leading-relaxed shadow-pop"
      style={{
        left: position.left,
        top: position.top,
        transform: position.placeAbove ? "translateY(-100%)" : undefined,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onPin}
    >
      <div className="flex items-start gap-2">
        <Pill tone={meta.tone} className="shrink-0">
          <Icon className="h-3 w-3" /> {meta.label}
        </Pill>
        <span className="shrink-0 text-[10.5px] text-txt3">{relativeTime(intent.createdAt)}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-auto -mr-1 -mt-0.5 rounded p-0.5 text-txt3 transition-colors hover:bg-panel2 hover:text-txt"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-1.5 line-clamp-2 font-medium text-txt">{intent.title || "(untitled change)"}</p>

      {why && (
        <p className="mt-1 line-clamp-3 text-txt2">{why.length > 220 ? `${why.slice(0, 220)}…` : why}</p>
      )}
      {intent.paths.length > 1 && (
        <p className="mt-1 text-[10.5px] text-txt3">
          part of a change touching {intent.paths.length} files
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          disabled={!!asking}
          onClick={(e) => {
            e.stopPropagation();
            void ask("why");
          }}
          className="inline-flex items-center gap-1 rounded-card-sm border border-border2 bg-panel2 px-2 py-1 text-[11px] text-txt2 transition-colors hover:text-txt disabled:opacity-50"
        >
          {asking === "why" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Why?
        </button>
        <button
          type="button"
          disabled={!!asking}
          onClick={(e) => {
            e.stopPropagation();
            void ask("impact");
          }}
          className="inline-flex items-center gap-1 rounded-card-sm border border-border2 bg-panel2 px-2 py-1 text-[11px] text-txt2 transition-colors hover:text-txt disabled:opacity-50"
        >
          {asking === "impact" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          If removed?
        </button>
        {isOwner && intent.status !== "reverted" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUndo({ id: intent.id, title: intent.title });
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-card-sm border border-[color-mix(in_srgb,var(--red)_35%,transparent)] px-2 py-1 text-[11px] text-bad transition-colors hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)]"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
        )}
      </div>

      {answer && (
        <div className="scroll-area mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-panel2/40 px-2.5 py-2 text-txt2">
          <Markdown content={answer.text} />
        </div>
      )}
    </div>
  );
}
