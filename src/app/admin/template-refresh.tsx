"use client";

/**
 * Admin "Template builder" — runs the template refresh batch job and shows a
 * LIVE terminal of what's happening (streamed NDJSON log lines), plus a
 * per-template status list. Regenerates the CLI-based starters in a sandbox,
 * build-gates them, and updates them in the DB live (no redeploy).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface TemplateStatus {
  templateId: string;
  label: string;
  cli: string;
  refreshable: boolean;
  source: string;
  refreshState: string | null;
  refreshError: string | null;
  refreshedAt: string | null;
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

function stateBadge(s: string | null): { label: string; cls: string } {
  switch (s) {
    case "ok":
      return { label: "ok", cls: "text-ok" };
    case "building":
      return { label: "building…", cls: "text-accent" };
    case "error":
      return { label: "error", cls: "text-bad" };
    default:
      return { label: "—", cls: "text-txt3" };
  }
}

export function TemplateRefresh() {
  const [items, setItems] = useState<TemplateStatus[]>([]);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const termRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/templates/refresh", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setItems(json.data.templates as TemplateStatus[]);
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
      const res = await fetch("/api/admin/templates/refresh", { method: "POST" });
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
            /* ignore malformed partial */
          }
        }
      }
    } catch (e) {
      setLines((l) => [...l, `✗ ${e instanceof Error ? e.message : "refresh failed"}`]);
    }
    setRunning(false);
    void load();
  }

  return (
    <div className="rounded-card-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <button type="button" disabled={running} onClick={() => void run()} className={btn}>
          {running ? "Running…" : "Run refresh"}
        </button>
        <Link href="/admin/templates" className={btn}>
          View stored templates →
        </Link>
        {items.some((t) => t.refreshState === "building") && (
          <span className="text-[11px] text-accent">a build is in progress…</span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-txt3">
        Regenerates the CLI-based starters from their official CLIs inside a sandbox, build-gates them, and updates
        them live in the database — no redeploy. Hand-authored templates are left as-is. A red build never replaces a
        working template.
      </p>

      <div className="mt-3 divide-y divide-border/60">
        {items.map((t) => {
          const b = stateBadge(t.refreshState);
          return (
            <div key={t.templateId} className="flex items-center gap-3 py-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-txt2">
                {t.label} {!t.refreshable && <span className="text-txt3">· hand-authored</span>}
              </span>
              {t.source === "refresh" && <span className="text-[10.5px] text-txt3">refreshed</span>}
              <span className={`w-20 text-right ${b.cls}`}>{b.label}</span>
              <span className="w-28 text-right text-txt3">
                {t.refreshedAt ? new Date(t.refreshedAt).toLocaleDateString() : "—"}
              </span>
            </div>
          );
        })}
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
              <span className="text-[12px] font-medium text-txt2">Template builder · batch job</span>
              {running && <span className="ml-auto animate-pulse text-[11px] text-accent">running…</span>}
            </header>
            <div
              ref={termRef}
              className="scroll-area flex-1 overflow-auto bg-[#0a0e16] p-3 font-mono text-[11.5px] leading-relaxed"
            >
              {lines.length === 0 && <div className="text-txt3">starting…</div>}
              {lines.map((l, i) => (
                <div key={i} className={`whitespace-pre-wrap ${lineTone(l)}`}>
                  {l || " "}
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
