"use client";

import { useMemo, useState } from "react";
import { X, Plus, Search, Boxes, Camera } from "lucide-react";
import { WIDGET_CATALOG } from "@/lib/lessons/widgets";
import { DATASETS } from "@/components/lab/datasets";
import { WidgetHost } from "@/components/lab/widgets";
import { cn } from "@/lib/utils";

/*
 * WidgetStore — a browsable gallery of every interactive widget. Teachers pick a
 * widget, see a LIVE preview, choose its phase + dataset, and drop a configured
 * widget step into their lesson. This is phase 3A of the widget store: browse +
 * reuse what exists. "Create your own" (configurable templates) comes next.
 */

const DATASET_IDS = Object.keys(DATASETS);
const WIDGET_PHASES: Record<string, string[]> = {
  neuronBoundary: ["explore", "step", "reveal", "generalize", "youdo", "fail"],
};
/** Widgets whose live preview we skip (e.g. would open the camera). */
const PREVIEW_SKIP = new Set(["classifier"]);

export function WidgetStore({
  onAdd,
  onClose,
}: {
  onAdd: (widget: string, config?: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(WIDGET_CATALOG[0]?.id ?? "");
  const [phase, setPhase] = useState("");
  const [dataset, setDataset] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WIDGET_CATALOG;
    return WIDGET_CATALOG.filter((w) => `${w.label} ${w.desc}`.toLowerCase().includes(q));
  }, [query]);

  const selected = WIDGET_CATALOG.find((w) => w.id === selectedId);
  const phases = selected ? WIDGET_PHASES[selected.id] : undefined;

  function select(id: string) {
    setSelectedId(id);
    setPhase(WIDGET_PHASES[id]?.[0] ?? "");
    setDataset("");
  }

  function buildConfig(): Record<string, unknown> | undefined {
    const cfg: Record<string, unknown> = {};
    if (phase) cfg.phase = phase;
    if (dataset) cfg.dataset = dataset;
    return Object.keys(cfg).length ? cfg : undefined;
  }

  const config = buildConfig();
  const previewKey = `${selectedId}:${phase}:${dataset}`;
  const skipPreview = selected ? PREVIEW_SKIP.has(selected.id) : true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-card">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-bg2 px-4 py-3">
          <Boxes className="h-4 w-4 text-accent" />
          <span className="text-[14px] font-semibold text-txt">Widget store</span>
          <span className="text-[12px] text-txt3">— pick an interactive piece for your lesson</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto text-txt3 transition-colors hover:text-txt">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[280px_1fr]">
          {/* List */}
          <div className="flex min-h-0 flex-col border-b border-border sm:border-b-0 sm:border-r">
            <div className="border-b border-border p-2.5">
              <div className="flex items-center gap-2 rounded-md border border-border2 bg-panel2 px-2.5">
                <Search className="h-3.5 w-3.5 text-txt3" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search widgets…"
                  className="flex-1 bg-transparent py-1.5 text-[12.5px] text-txt outline-none placeholder:text-txt3"
                />
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => select(w.id)}
                    className={cn(
                      "mb-1 block w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                      w.id === selectedId
                        ? "border-accent bg-panel2"
                        : "border-transparent hover:border-border2 hover:bg-panel2",
                    )}
                  >
                    <div className="text-[12.5px] font-medium text-txt">{w.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-txt3">{w.desc.split(". Use for")[0]}</div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-2 py-3 text-[12px] text-txt3">No widgets match “{query}”.</li>}
            </ul>
          </div>

          {/* Detail + preview */}
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selected ? (
                <>
                  <h3 className="text-[15px] font-semibold text-txt">{selected.label}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-txt2">{selected.desc}</p>

                  {/* Config */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {phases && (
                      <label className="flex items-center gap-1.5 text-[12px] text-txt3">
                        Phase
                        <select value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded-md border border-border2 bg-panel2 px-2 py-1 text-[12px] text-txt2 outline-none focus:border-accent">
                          {phases.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-[12px] text-txt3">
                      Dataset
                      <select value={dataset} onChange={(e) => setDataset(e.target.value)} className="rounded-md border border-border2 bg-panel2 px-2 py-1 text-[12px] text-txt2 outline-none focus:border-accent">
                        <option value="">(default)</option>
                        {DATASET_IDS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Live preview */}
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-txt3">Live preview</div>
                    {skipPreview ? (
                      <div className="flex items-center gap-2 rounded-card border border-dashed border-border2 bg-panel2 p-6 text-[12px] text-txt3">
                        <Camera className="h-4 w-4" /> This widget uses the camera — add it to your lesson to try it live.
                      </div>
                    ) : (
                      <div key={previewKey} className="rounded-card border border-border bg-bg2 p-2">
                        <WidgetHost widget={selected.id} config={config} onComplete={() => {}} onState={() => {}} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] text-txt3">Pick a widget on the left.</p>
              )}
            </div>

            {/* Add */}
            <div className="flex items-center gap-2 border-t border-border p-3">
              <span className="text-[11.5px] text-txt3">Drops a configured widget step at the end of your lesson.</span>
              <button
                onClick={() => selected && onAdd(selected.id, config)}
                disabled={!selected}
                className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add to lesson
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
