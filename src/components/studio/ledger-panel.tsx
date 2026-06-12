"use client";

/**
 * Intent-ledger side panel (Code tab): the provenance of the clicked line —
 * which request introduced it, the approved plan step, the agent's
 * reasoning, sibling files, and protecting tests — plus two grounded AI
 * questions ("Why does this exist?" / "What breaks if I remove it?") and an
 * entry point into intentional undo.
 */

import { useState } from "react";
import { Bot, History, Loader2, Pencil, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Markdown } from "@/components/ui/markdown";

export interface LedgerRangeDto {
  start: number;
  end: number;
  intentId: string | null; // null = base, "uncaptured" = drift
}

export interface LedgerIntentDto {
  id: string;
  kind: string; // agent | manual | undo
  status: string; // open | final | reverted
  title: string;
  createdAt: string;
  userRequest: string;
  planText: string | null;
  reasoning: string | null;
  alternatives: string | null;
  revertsIntentId: string | null;
  paths: string[];
}

export interface LedgerDto {
  ranges: LedgerRangeDto[];
  intents: Record<string, LedgerIntentDto>;
  tests: string[];
}

export function kindMeta(kind: string): { icon: typeof Bot; label: string; tone: "accent" | "amber" | "red" } {
  if (kind === "manual") return { icon: Pencil, label: "manual edit", tone: "amber" };
  if (kind === "undo") return { icon: Undo2, label: "undo", tone: "red" };
  return { icon: Bot, label: "AI change", tone: "accent" };
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-tactical mb-1 text-[10px]">{label}</div>
      {children}
    </div>
  );
}

export function LedgerPanel({
  workspaceId,
  path,
  line,
  ledger,
  loading,
  hasUnsavedEdits,
  isOwner,
  importMode,
  onUndo,
}: {
  workspaceId: string;
  path: string;
  line: number | null;
  ledger: LedgerDto | null;
  loading: boolean;
  /** The editor buffer is dirty — blame reflects the last save. */
  hasUnsavedEdits: boolean;
  isOwner: boolean;
  importMode: boolean;
  onUndo: (intent: { id: string; title: string }) => void;
}) {
  const [asking, setAsking] = useState<"why" | "impact" | null>(null);
  // Answers are keyed by (path, line) so a new selection simply stops
  // matching — no reset effect needed.
  const [answerFor, setAnswerFor] = useState<{
    path: string;
    line: number;
    question: "why" | "impact";
    text: string;
  } | null>(null);
  const answer = answerFor && answerFor.path === path && answerFor.line === line ? answerFor : null;

  const range = line && ledger ? ledger.ranges.find((r) => line >= r.start && line <= r.end) : null;
  const intent =
    range?.intentId && range.intentId !== "uncaptured" ? (ledger?.intents[range.intentId] ?? null) : null;

  async function ask(question: "why" | "impact") {
    if (!line || asking) return;
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
        path,
        line,
        question,
        text: res.ok && json?.ok ? json.data.text : (json?.error?.message ?? "Couldn't get an answer."),
      });
    } catch {
      setAnswerFor({ path, line, question, text: "Couldn't get an answer." });
    }
    setAsking(null);
  }

  return (
    <aside className="scroll-area flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-3 text-[12.5px] leading-relaxed">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-accent" />
        <span className="label-tactical">Intent ledger</span>
        {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-txt3" />}
      </div>

      {hasUnsavedEdits && (
        <p className="rounded-lg border border-border bg-panel2/50 px-2.5 py-1.5 text-[11.5px] text-txt3">
          Unsaved edits — the ledger reflects the last save.
        </p>
      )}

      {!line ? (
        <p className="text-txt3">
          Click a line in the editor to see why it exists: the request that introduced it, the plan it
          implements, and what protects it.
        </p>
      ) : !ledger ? (
        loading ? null : (
          <p className="text-txt3">No ledger available for this file yet.</p>
        )
      ) : intent ? (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const meta = kindMeta(intent.kind);
                const Icon = meta.icon;
                return (
                  <Pill tone={meta.tone}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </Pill>
                );
              })()}
              {intent.status === "reverted" && <Pill tone="red">reverted</Pill>}
              <span className="text-[11px] text-txt3">{new Date(intent.createdAt).toLocaleString()}</span>
            </div>
            <p className={`mt-1.5 font-medium text-txt ${intent.status === "reverted" ? "line-through" : ""}`}>
              {intent.title || "(untitled change)"}
            </p>
            <p className="mt-0.5 text-[11px] text-txt3">
              line {line} · {range!.start === range!.end ? `line ${range!.start}` : `lines ${range!.start}–${range!.end}`} from this change
            </p>
          </div>

          {intent.kind !== "manual" && intent.userRequest && (
            <Section label="Request">
              <p className="whitespace-pre-wrap text-txt2">
                {intent.userRequest.length > 400 ? `${intent.userRequest.slice(0, 400)}…` : intent.userRequest}
              </p>
            </Section>
          )}

          {intent.planText && (
            <Section label="Approved plan">
              <details className="rounded-lg border border-border bg-panel2/40 px-2.5 py-1.5">
                <summary className="cursor-pointer select-none text-[11.5px] text-txt2">show the plan</summary>
                <div className="mt-1.5 text-txt2">
                  <Markdown content={intent.planText.slice(0, 4000)} />
                </div>
              </details>
            </Section>
          )}

          {intent.reasoning && (
            <Section label="Agent's summary">
              <div className="text-txt2">
                <Markdown
                  content={
                    intent.reasoning.length > 700 ? `${intent.reasoning.slice(0, 700)}…` : intent.reasoning
                  }
                />
              </div>
            </Section>
          )}

          {intent.alternatives && (
            <Section label="Rejected alternatives">
              <p className="whitespace-pre-wrap text-txt2">{intent.alternatives.slice(0, 600)}</p>
            </Section>
          )}

          <Section label="Files in this change">
            <ul className="space-y-0.5 font-mono text-[11px] text-txt2">
              {intent.paths.slice(0, 12).map((p) => (
                <li key={p} className={p === path ? "text-accent" : undefined}>
                  {p}
                </li>
              ))}
              {intent.paths.length > 12 && <li className="text-txt3">… {intent.paths.length - 12} more</li>}
            </ul>
          </Section>

          <Section label="Protected by tests">
            {ledger.tests.length ? (
              <ul className="space-y-0.5 font-mono text-[11px] text-txt2">
                {ledger.tests.map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 shrink-0 text-ok" /> {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-txt3">No tests reference this file.</p>
            )}
          </Section>

          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              disabled={!!asking}
              onClick={() => void ask("why")}
              className="justify-start px-2.5 py-1.5 text-[12px]"
            >
              {asking === "why" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Why does this exist?
            </Button>
            <Button
              variant="ghost"
              disabled={!!asking}
              onClick={() => void ask("impact")}
              className="justify-start px-2.5 py-1.5 text-[12px]"
            >
              {asking === "impact" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              What breaks if I remove it?
            </Button>
          </div>

          {answer && (
            <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-txt2">
              <div className="label-tactical mb-1 text-[10px]">
                {answer.question === "why" ? "Why it exists" : "Removal impact"}
              </div>
              <Markdown content={answer.text} />
            </div>
          )}

          {isOwner && intent.status !== "reverted" && (
            <Button
              variant="ghost"
              onClick={() => onUndo({ id: intent.id, title: intent.title })}
              className="justify-start px-2.5 py-1.5 text-[12px] text-bad hover:text-bad"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo this change…
            </Button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-txt2">
            {range?.intentId === "uncaptured"
              ? "This line was edited outside captured history — its origin wasn't recorded."
              : importMode
                ? "This line comes from the imported repository — it predates Helix's ledger."
                : "This line predates the ledger (or its history was trimmed)."}
          </p>
          <p className="text-[11.5px] text-txt3">
            Provenance is captured from now on: every AI build turn and manual save becomes a ledger entry.
          </p>
        </div>
      )}
    </aside>
  );
}
