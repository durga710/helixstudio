"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Search, Boxes, Camera, Wand2, Trash2, GripVertical, Save, Loader2, Library } from "lucide-react";
import { WIDGET_CATALOG } from "@/lib/lessons/widgets";
import { DATASETS } from "@/components/lab/datasets";
import { WidgetHost } from "@/components/lab/widgets";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/*
 * WidgetStore — the teacher's library of interactive widgets, two ways in:
 *   Browse — every built-in widget, with a live preview + phase/dataset config,
 *            inserted into the lesson as a configured step (phase 3A).
 *   Create — fill a flexible TEMPLATE (sort game / flashcards) with your OWN data
 *            and drop it in (phase 3B). Pure config → safe, no code. A persistent
 *            cross-lesson "my widgets" library is the next step.
 */

const DATASET_IDS = Object.keys(DATASETS);
const WIDGET_PHASES: Record<string, string[]> = {
  neuronBoundary: ["explore", "step", "reveal", "generalize", "youdo", "fail"],
};
const PREVIEW_SKIP = new Set(["classifier"]);

type Mode = "browse" | "create" | "mine";
const MODE_LABEL: Record<Mode, string> = { browse: "Browse", create: "Create your own", mine: "My widgets" };

export function WidgetStore({
  spaceId,
  onAdd,
  onClose,
}: {
  spaceId: string;
  onAdd: (widget: string, config?: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("browse");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-card">
        {/* Header + tabs */}
        <div className="flex items-center gap-2 border-b border-border bg-bg2 px-4 py-3">
          <Boxes className="h-4 w-4 text-accent" />
          <span className="text-[14px] font-semibold text-txt">Widget store</span>
          <div className="ml-3 flex items-center gap-1 rounded-lg border border-border2 bg-panel2 p-0.5">
            {(["browse", "create", "mine"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                  mode === m ? "bg-accent text-accent-ink" : "text-txt2 hover:text-txt",
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto text-txt3 transition-colors hover:text-txt">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "browse" ? (
          <BrowsePane onAdd={onAdd} />
        ) : mode === "create" ? (
          <CreatePane spaceId={spaceId} onAdd={onAdd} />
        ) : (
          <MinePane spaceId={spaceId} onAdd={onAdd} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Browse ----------------------------- */
function BrowsePane({ onAdd }: { onAdd: (widget: string, config?: Record<string, unknown>) => void }) {
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
  const config = useMemo(() => {
    const cfg: Record<string, unknown> = {};
    if (phase) cfg.phase = phase;
    if (dataset) cfg.dataset = dataset;
    return Object.keys(cfg).length ? cfg : undefined;
  }, [phase, dataset]);

  const skipPreview = selected ? PREVIEW_SKIP.has(selected.id) : true;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[280px_1fr]">
      <div className="flex min-h-0 flex-col border-b border-border sm:border-b-0 sm:border-r">
        <div className="border-b border-border p-2.5">
          <div className="flex items-center gap-2 rounded-md border border-border2 bg-panel2 px-2.5">
            <Search className="h-3.5 w-3.5 text-txt3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search widgets…" className="flex-1 bg-transparent py-1.5 text-[12.5px] text-txt outline-none placeholder:text-txt3" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => select(w.id)}
                className={cn("mb-1 block w-full rounded-md border px-2.5 py-2 text-left transition-colors", w.id === selectedId ? "border-accent bg-panel2" : "border-transparent hover:border-border2 hover:bg-panel2")}
              >
                <div className="text-[12.5px] font-medium text-txt">{w.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-txt3">{w.desc.split(". Use for")[0]}</div>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-2 py-3 text-[12px] text-txt3">No widgets match “{query}”.</li>}
        </ul>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <>
              <h3 className="text-[15px] font-semibold text-txt">{selected.label}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-txt2">{selected.desc}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {phases && (
                  <label className="flex items-center gap-1.5 text-[12px] text-txt3">
                    Phase
                    <select value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded-md border border-border2 bg-panel2 px-2 py-1 text-[12px] text-txt2 outline-none focus:border-accent">
                      {phases.map((p) => (<option key={p} value={p}>{p}</option>))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-[12px] text-txt3">
                  Dataset
                  <select value={dataset} onChange={(e) => setDataset(e.target.value)} className="rounded-md border border-border2 bg-panel2 px-2 py-1 text-[12px] text-txt2 outline-none focus:border-accent">
                    <option value="">(default)</option>
                    {DATASET_IDS.map((d) => (<option key={d} value={d}>{d}</option>))}
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-txt3">Live preview</div>
                {skipPreview ? (
                  <div className="flex items-center gap-2 rounded-card border border-dashed border-border2 bg-panel2 p-6 text-[12px] text-txt3">
                    <Camera className="h-4 w-4" /> This widget uses the camera — add it to your lesson to try it live.
                  </div>
                ) : (
                  <div key={`${selectedId}:${phase}:${dataset}`} className="rounded-card border border-border bg-bg2 p-2">
                    <WidgetHost widget={selected.id} config={config} onComplete={() => {}} onState={() => {}} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-txt3">Pick a widget on the left.</p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <span className="text-[11.5px] text-txt3">Drops a configured widget step at the end of your lesson.</span>
          <button onClick={() => selected && onAdd(selected.id, config)} disabled={!selected} className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40">
            <Plus className="h-4 w-4" /> Add to lesson
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Create ----------------------------- */
interface SortItem { a: number; b: number; bin: number }
interface Card { front: string; back: string }

function CreatePane({ spaceId, onAdd }: { spaceId: string; onAdd: (widget: string, config?: Record<string, unknown>) => void }) {
  const { toast } = useToast();
  const [template, setTemplate] = useState<"customSort" | "customFlashcards">("customSort");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // customSort state
  const [binA, setBinA] = useState("Cats");
  const [binB, setBinB] = useState("Dogs");
  const [clueA, setClueA] = useState("ear size");
  const [clueB, setClueB] = useState("tail length");
  const [items, setItems] = useState<SortItem[]>([
    { a: 3, b: 3, bin: 0 },
    { a: 8, b: 7, bin: 1 },
    { a: 2, b: 4, bin: 0 },
    { a: 7, b: 8, bin: 1 },
  ]);

  // customFlashcards state
  const [cards, setCards] = useState<Card[]>([
    { front: "Neuron", back: "A tiny decision-maker that draws one line" },
    { front: "Weights", back: "The dials that tilt the line" },
  ]);

  const config = useMemo<Record<string, unknown>>(() => {
    if (template === "customSort") return { binA, binB, clueA, clueB, items };
    return { cards };
  }, [template, binA, binB, clueA, clueB, items, cards]);

  const inputCls = "w-full rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[13px] text-txt outline-none placeholder:text-txt3 focus:border-accent";

  async function save() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lab/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, template, title: t, config }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) toast("Saved to My widgets — reuse it in any lesson");
      else toast(j?.error?.message ?? "Couldn't save the widget");
    } catch {
      toast("Couldn't save the widget");
    }
    setSaving(false);
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
      {/* Form */}
      <div className="min-h-0 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center gap-2">
          {(["customSort", "customFlashcards"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTemplate(t)}
              className={cn("rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors", template === t ? "border-accent bg-panel2 text-txt" : "border-border2 text-txt2 hover:border-accent hover:text-txt")}
            >
              {t === "customSort" ? "Sort game" : "Flashcards"}
            </button>
          ))}
        </div>

        {template === "customSort" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Bin 1 name"><input value={binA} onChange={(e) => setBinA(e.target.value)} className={inputCls} /></Labeled>
              <Labeled label="Bin 2 name"><input value={binB} onChange={(e) => setBinB(e.target.value)} className={inputCls} /></Labeled>
              <Labeled label="Clue 1 label"><input value={clueA} onChange={(e) => setClueA(e.target.value)} className={inputCls} /></Labeled>
              <Labeled label="Clue 2 label"><input value={clueB} onChange={(e) => setClueB(e.target.value)} className={inputCls} /></Labeled>
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-txt3">Items (clue values 0–10 + correct bin)</span>
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-txt3" />
                    <input type="number" min={0} max={10} value={it.a} onChange={(e) => setItems((xs) => xs.map((x, xi) => (xi === i ? { ...x, a: clamp(Number(e.target.value)) } : x)))} className={cn(inputCls, "w-16")} title={clueA} />
                    <input type="number" min={0} max={10} value={it.b} onChange={(e) => setItems((xs) => xs.map((x, xi) => (xi === i ? { ...x, b: clamp(Number(e.target.value)) } : x)))} className={cn(inputCls, "w-16")} title={clueB} />
                    <select value={it.bin} onChange={(e) => setItems((xs) => xs.map((x, xi) => (xi === i ? { ...x, bin: Number(e.target.value) } : x)))} className={cn(inputCls, "flex-1")}>
                      <option value={0}>{binA}</option>
                      <option value={1}>{binB}</option>
                    </select>
                    <button onClick={() => setItems((xs) => xs.filter((_, xi) => xi !== i))} disabled={items.length <= 2} className="text-txt3 hover:text-bad disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => setItems((xs) => [...xs, { a: 5, b: 5, bin: 0 }])} className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"><Plus className="h-3 w-3" /> add item</button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-txt3">Cards (front &amp; back)</span>
            <div className="space-y-1.5">
              {cards.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={c.front} onChange={(e) => setCards((xs) => xs.map((x, xi) => (xi === i ? { ...x, front: e.target.value } : x)))} placeholder="Front" className={cn(inputCls, "flex-1")} />
                  <input value={c.back} onChange={(e) => setCards((xs) => xs.map((x, xi) => (xi === i ? { ...x, back: e.target.value } : x)))} placeholder="Back" className={cn(inputCls, "flex-1")} />
                  <button onClick={() => setCards((xs) => xs.filter((_, xi) => xi !== i))} disabled={cards.length <= 1} className="text-txt3 hover:text-bad disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button onClick={() => setCards((xs) => [...xs, { front: "", back: "" }])} className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"><Plus className="h-3 w-3" /> add card</button>
            </div>
          </div>
        )}
      </div>

      {/* Preview + add */}
      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-txt3">
            <Wand2 className="h-3.5 w-3.5 text-accent" /> Live preview
          </div>
          <div key={`${template}:${JSON.stringify(config).length}`} className="rounded-card border border-border bg-bg2 p-2">
            <WidgetHost widget={template} config={config} onComplete={() => {}} onState={() => {}} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name it to save (e.g. Sort fruits)"
            className="min-w-[160px] flex-1 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12.5px] text-txt outline-none placeholder:text-txt3 focus:border-accent"
          />
          <button
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel2 px-3 py-2 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save to library
          </button>
          <button onClick={() => onAdd(template, config)} className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110">
            <Plus className="h-4 w-4" /> Add to lesson
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- My widgets ----------------------------- */
interface SavedWidget {
  id: string;
  title: string;
  template: string;
  config: Record<string, unknown>;
}
function MinePane({ spaceId, onAdd }: { spaceId: string; onAdd: (widget: string, config?: Record<string, unknown>) => void }) {
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<SavedWidget[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/lab/widgets?spaceId=${encodeURIComponent(spaceId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setWidgets((j?.data?.widgets ?? []) as SavedWidget[]);
      })
      .catch(() => alive && setWidgets([]));
    return () => {
      alive = false;
    };
  }, [spaceId]);

  async function remove(id: string) {
    if (!window.confirm("Delete this saved widget?")) return;
    try {
      const res = await fetch(`/api/lab/widgets/${id}`, { method: "DELETE" });
      if (res.ok) {
        setWidgets((ws) => ws?.filter((w) => w.id !== id) ?? null);
        if (selected === id) setSelected(null);
      } else toast("Couldn't delete");
    } catch {
      toast("Couldn't delete");
    }
  }

  const sel = widgets?.find((w) => w.id === selected) ?? null;
  const labelFor = (t: string) => WIDGET_CATALOG.find((w) => w.id === t)?.label ?? t;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[280px_1fr]">
      <div className="min-h-0 overflow-y-auto border-b border-border p-2 sm:border-b-0 sm:border-r">
        {widgets === null ? (
          <div className="flex items-center gap-2 px-2 py-3 text-[12px] text-txt3"><Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…</div>
        ) : widgets.length === 0 ? (
          <div className="px-2 py-3 text-[12px] leading-relaxed text-txt3">
            No saved widgets yet. Make one in <b className="text-txt2">Create your own</b> and press <b className="text-txt2">Save to library</b>.
          </div>
        ) : (
          <ul>
            {widgets.map((w) => (
              <li key={w.id} className="mb-1 flex items-center gap-1">
                <button
                  onClick={() => setSelected(w.id)}
                  className={cn("min-w-0 flex-1 rounded-md border px-2.5 py-2 text-left transition-colors", w.id === selected ? "border-accent bg-panel2" : "border-transparent hover:border-border2 hover:bg-panel2")}
                >
                  <div className="truncate text-[12.5px] font-medium text-txt">{w.title}</div>
                  <div className="text-[11px] text-txt3">{labelFor(w.template)}</div>
                </button>
                <button onClick={() => void remove(w.id)} title="Delete" className="shrink-0 text-txt3 transition-colors hover:text-bad"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {sel ? (
            <>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-txt3">
                <Library className="h-3.5 w-3.5 text-accent" /> {sel.title}
              </div>
              <div key={sel.id} className="rounded-card border border-border bg-bg2 p-2">
                <WidgetHost widget={sel.template} config={sel.config} onComplete={() => {}} onState={() => {}} />
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-txt3">Pick a saved widget to preview it.</p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <span className="text-[11.5px] text-txt3">Reuse a saved widget in this lesson.</span>
          <button onClick={() => sel && onAdd(sel.template, sel.config)} disabled={!sel} className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40">
            <Plus className="h-4 w-4" /> Add to lesson
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-txt3">{label}</span>
      {children}
    </label>
  );
}
