"use client";

/**
 * Admin "Premium library freshness" — runs the freshness batch job (bumps each
 * premium template's libraries to the latest safe version, build-gates, auto-
 * applies on green; majors held for review) with a LIVE terminal, and shows each
 * template's library state (held majors, last bump, errors).
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Held {
  name: string;
  from: string;
  latest: string;
}
interface Suggestion {
  lib: string;
  why: string;
}
interface LibraryState {
  checkedAt?: string;
  applied?: boolean;
  bumped?: { name: string; from: string; to: string }[];
  held?: Held[];
  suggestions?: Suggestion[];
}
interface FreshnessItem {
  templateId: string;
  label: string;
  source: string;
  libraryState: LibraryState | null;
  libraryCheckedAt: string | null;
  freshnessError: string | null;
}

const btn =
  "rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt disabled:cursor-not-allowed disabled:opacity-50";

function lineTone(l: string): string {
  if (l.startsWith("✔") || l.startsWith("✓")) return "text-ok";
  if (l.startsWith("✗")) return "text-bad";
  if (l.startsWith("▶")) return "text-accent";
  if (l.startsWith("  ")) return "text-txt3";
  return "text-txt2";
}

export function TemplateFreshness() {
  const [items, setItems] = useState<FreshnessItem[]>([]);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [scoutNote, setScoutNote] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const termRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/templates/freshness", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setItems(json.data.templates as FreshnessItem[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [lines]);

  async function run() {
    setOpen(true);
    setRunning(true);
    setLines([]);
    try {
      const res = await fetch("/api/admin/templates/freshness", { method: "POST" });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!raw.trim()) continue;
          try {
            const ev = JSON.parse(raw) as { type: string; line?: string };
            if (ev.type === "log" && typeof ev.line === "string") {
              setLines((l) => [...l, ...ev.line!.split("\n")]);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      setLines((l) => [...l, `✗ ${e instanceof Error ? e.message : "freshness failed"}`]);
    }
    setRunning(false);
    void load();
  }

  async function scout() {
    setScouting(true);
    setScoutNote(null);
    try {
      const res = await fetch("/api/admin/templates/scout", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        const n = Object.keys(json.data.suggestions ?? {}).length;
        setScoutNote(`Got suggestions for ${n} template${n === 1 ? "" : "s"} — see below.`);
        await load();
      } else {
        setScoutNote(json?.error?.message ?? "Scout failed.");
      }
    } catch {
      setScoutNote("Scout failed.");
    }
    setScouting(false);
  }

  return (
    <div className="rounded-card-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <button type="button" disabled={running} onClick={() => void run()} className={btn}>
          {running ? "Running…" : "Refresh premium libraries"}
        </button>
        <button type="button" disabled={scouting} onClick={() => void scout()} className={btn}>
          {scouting ? "Scouting…" : "Suggest libraries (AI)"}
        </button>
        {scoutNote && <span className="text-[11px] text-txt3">{scoutNote}</span>}
      </div>
      <p className="mt-2 text-[11px] text-txt3">
        Bumps each premium template&apos;s libraries to the latest safe version (same-major minor/patch), build-gates
        the result in a sandbox, and auto-applies it only on a green build. Major versions are held for your review; a
        red build keeps the current template. Runs weekly via cron; this is the manual trigger.
      </p>

      <div className="mt-3 divide-y divide-border/60">
        {items.map((t) => {
          const held = t.libraryState?.held ?? [];
          const bumped = t.libraryState?.bumped ?? [];
          return (
            <div key={t.templateId} className="py-2 text-[12px]">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-txt2">{t.label}</span>
                {t.source === "freshness" && <span className="text-[10.5px] text-txt3">updated</span>}
                {held.length > 0 && <span className="text-[11px] text-accent">{held.length} major held</span>}
                {t.freshnessError && <span className="text-[11px] text-bad">error</span>}
                <span className="w-28 text-right text-txt3">
                  {t.libraryCheckedAt ? new Date(t.libraryCheckedAt).toLocaleDateString() : "never"}
                </span>
              </div>
              {held.length > 0 && (
                <div className="mt-1 text-[11px] text-txt3">
                  held: {held.map((h) => `${h.name} ${h.from}→${h.latest}`).join(", ")}
                </div>
              )}
              {bumped.length > 0 && (
                <div className="mt-0.5 text-[11px] text-ok">
                  bumped: {bumped.map((b) => `${b.name}→${b.to}`).join(", ")}
                </div>
              )}
              {(t.libraryState?.suggestions?.length ?? 0) > 0 && (
                <div className="mt-1 text-[11px] text-txt3">
                  <span className="text-accent">AI suggests:</span>{" "}
                  {t.libraryState!.suggestions!.map((s) => `${s.lib} (${s.why})`).join(", ")}
                </div>
              )}
              {t.freshnessError && <div className="mt-0.5 text-[11px] text-bad">{t.freshnessError}</div>}
            </div>
          );
        })}
        {items.length === 0 && <div className="py-2 text-[11px] text-txt3">No premium templates checked yet.</div>}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => {
            if (!running) setOpen(false);
          }}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border2 bg-[#0a0e16] shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-border bg-[#0d1220] px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              </span>
              <span className="text-[12px] font-medium text-txt2">Premium library freshness · batch job</span>
              {running && <span className="ml-auto animate-pulse text-[11px] text-accent">running…</span>}
            </header>
            <div
              ref={termRef}
              className="scroll-area flex-1 overflow-auto bg-[#0a0e16] p-3 font-mono text-[11.5px] leading-relaxed"
            >
              {lines.length === 0 && <div className="text-txt3">starting…</div>}
              {lines.map((l, i) => (
                <div key={i} className={`whitespace-pre-wrap ${lineTone(l)}`}>
                  {l || " "}
                </div>
              ))}
              {running && <span className="inline-block h-3 w-2 animate-pulse bg-accent align-middle" />}
            </div>
            <footer className="border-t border-border bg-[#0d1220] px-4 py-2.5 text-right">
              <button type="button" disabled={running} onClick={() => setOpen(false)} className={btn}>
                {running ? "Working…" : "Close"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
