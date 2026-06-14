"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, RotateCcw, Wand2, GraduationCap } from "lucide-react";
import type { WidgetProps } from "./index";
import { CORPORA, getCorpus } from "@/components/lab/lm-corpora";

/* LangModel — a "tiny GPT". The student trains a real next-word language model
 * on a bit of text (a word-level n-gram), peeks at exactly what it learned (the
 * next-word probability table), then generates new text — adjusting the context
 * window and "creativity" (temperature) and watching it change. It's the honest,
 * hands-on core of every LLM: predict the next token, then sample one. Pure JS,
 * no ML libs — trains instantly, like the neuron/regression widgets. */

const MAX_CORPUS_CHARS = 20_000;
const MAX_GEN_TOKENS = 50;
const TOP_K = 5;

/** Word-level model: context (last N tokens, joined) → { nextToken → count }. */
type Model = Map<string, Map<string, number>>;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.,!?'\s]/g, " ")
    .replace(/([.,!?])/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean);
}

function train(tokens: string[], n: number): Model {
  const model: Model = new Map();
  for (let i = n; i < tokens.length; i++) {
    const ctx = tokens.slice(i - n, i).join(" ");
    const next = tokens[i];
    let row = model.get(ctx);
    if (!row) {
      row = new Map();
      model.set(ctx, row);
    }
    row.set(next, (row.get(next) ?? 0) + 1);
  }
  return model;
}

/** Reshape raw counts into pick-probabilities under a temperature (creativity).
 * weight ∝ count^(1/T): T<1 sharpens toward the likeliest, T>1 flattens. */
function distribution(row: Map<string, number>, temperature: number): { token: string; p: number }[] {
  const exp = 1 / Math.max(0.1, temperature);
  const weighted = [...row.entries()].map(([token, c]) => ({ token, w: Math.pow(c, exp) }));
  const sum = weighted.reduce((s, x) => s + x.w, 0) || 1;
  return weighted.map((x) => ({ token: x.token, p: x.w / sum })).sort((a, b) => b.p - a.p);
}

function sample(row: Map<string, number>, temperature: number): string {
  const dist = distribution(row, temperature);
  let r = Math.random();
  for (const d of dist) {
    r -= d.p;
    if (r <= 0) return d.token;
  }
  return dist[dist.length - 1]?.token ?? ".";
}

function detokenize(tokens: string[]): string {
  let s = tokens.join(" ").replace(/\s+([.,!?])/g, "$1");
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
  return s;
}

const PROMPT_BAR = "h-full rounded-full bg-accent transition-[width] duration-150";

export function LangModel({ config, onComplete, onState }: WidgetProps) {
  const initialCorpus = typeof config?.corpus === "string" ? config.corpus : CORPORA[0].id;
  const [corpusId, setCorpusId] = useState(initialCorpus);
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [n, setN] = useState(typeof config?.contextWindow === "number" ? Math.min(3, Math.max(1, config.contextWindow)) : 2);
  const [temp, setTemp] = useState(typeof config?.temperature === "number" ? config.temperature : 0.8);

  const corpus = getCorpus(corpusId);
  const text = (useCustom ? custom : corpus.text).slice(0, MAX_CORPUS_CHARS);
  const tokens = useMemo(() => tokenize(text), [text]);

  const [model, setModel] = useState<Model | null>(null);
  const [trainedN, setTrainedN] = useState(n);
  const [trainedText, setTrainedText] = useState("");
  const [prompt, setPrompt] = useState(corpus.seed);
  const [output, setOutput] = useState("");
  const done = useRef(false);

  // Derived (no state-resetting effects): the model is stale whenever the text
  // or context window changed since the last Train.
  const stale = !model || trainedText !== text || trainedN !== n;

  const wordCount = tokens.filter((t) => !".,!?".includes(t)).length;
  const patternCount = model?.size ?? 0;

  function pickCorpus(id: string) {
    setCorpusId(id);
    setPrompt(getCorpus(id).seed);
    setOutput("");
  }
  function toggleCustom() {
    setUseCustom((v) => {
      const next = !v;
      if (!next) setPrompt(corpus.seed); // back to a preset — seed a known prompt
      setOutput("");
      return next;
    });
  }

  useEffect(() => {
    onState?.({
      corpus: useCustom ? "your own text" : corpus.name,
      words: wordCount,
      patterns: patternCount,
      contextWindow: n,
      temperature: temp,
      trained: !stale,
      lastPrompt: prompt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpus.name, useCustom, wordCount, patternCount, n, temp, stale, prompt]);

  // Live prediction table: what the trained model thinks comes next after the
  // prompt's last N words, reshaped by the current creativity (temperature).
  const prediction = useMemo(() => {
    if (!model || stale) return null;
    const ptoks = tokenize(prompt);
    const ctx = ptoks.slice(-trainedN).join(" ");
    const row = model.get(ctx);
    if (!row) return { ctx, rows: [] as { token: string; p: number }[] };
    return { ctx, rows: distribution(row, temp).slice(0, TOP_K) };
  }, [model, stale, prompt, trainedN, temp]);

  function doTrain() {
    if (tokens.length <= n) return;
    setModel(train(tokens, n));
    setTrainedN(n);
    setTrainedText(text);
    setOutput("");
  }

  function doGenerate() {
    if (!model || stale) return;
    const start = tokenize(prompt);
    const out = start.length ? [...start] : [];
    // If the prompt's tail isn't a context the model knows, begin from one it does.
    if (out.length < trainedN || !model.has(out.slice(-trainedN).join(" "))) {
      const seeds = [...model.keys()];
      const seed = seeds[Math.floor(Math.random() * seeds.length)]?.split(" ") ?? [];
      out.push(...seed);
    }
    for (let i = 0; i < MAX_GEN_TOKENS; i++) {
      const ctx = out.slice(-trainedN).join(" ");
      const row = model.get(ctx);
      if (!row) break;
      const next = sample(row, temp);
      out.push(next);
      if (next === "." && out.length > start.length + 6) break;
    }
    setOutput(detokenize(out));
    if (!done.current) {
      done.current = true;
      onComplete();
    }
  }

  function reset() {
    setModel(null);
    setOutput("");
    setUseCustom(false);
    setCorpusId(initialCorpus);
    setPrompt(getCorpus(initialCorpus).seed);
    setN(2);
    setTemp(0.8);
  }

  // When almost every context is unique (few repeats), the model can only
  // parrot its training text — the classic small-data / big-look-back giveaway.
  const memorizing = !stale && wordCount > 0 && patternCount / wordCount > 0.85;

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {/* 1 — the training text */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-txt2">1. Pick text to learn from</span>
        <button
          onClick={toggleCustom}
          className="text-[11.5px] text-accent transition-colors hover:brightness-110"
        >
          {useCustom ? "use a preset" : "paste my own"}
        </button>
      </div>
      {useCustom ? (
        <textarea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Paste a few sentences. The more repetitive, the better it reads back!"
          className="mt-1.5 h-24 w-full resize-none rounded-md border border-border2 bg-panel p-2 text-[12px] text-txt2 outline-none focus:border-accent"
        />
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CORPORA.map((c) => (
            <button
              key={c.id}
              onClick={() => pickCorpus(c.id)}
              className={`rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                corpusId === c.id
                  ? "border-accent bg-hl text-txt"
                  : "border-border2 bg-panel text-txt3 hover:border-accent hover:text-txt"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* 2 — context window + train */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-txt2">2. Look back</span>
        <div className="inline-flex overflow-hidden rounded-md border border-border2">
          {[1, 2, 3].map((k) => (
            <button
              key={k}
              onClick={() => setN(k)}
              className={`px-2.5 py-1 text-[12px] transition-colors ${
                n === k ? "bg-accent text-accent-ink" : "bg-panel text-txt3 hover:text-txt"
              }`}
            >
              {k} word{k > 1 ? "s" : ""}
            </button>
          ))}
        </div>
        <button
          onClick={doTrain}
          disabled={tokens.length <= n}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
        >
          <GraduationCap className="h-3.5 w-3.5" /> Train it
        </button>
      </div>
      <div className="mt-1.5 text-[11.5px] text-txt3">
        {stale ? (
          <>It looks at the last <b className="text-txt2">{n}</b> word{n > 1 ? "s" : ""} to guess the next one. Press <b className="text-txt2">Train it</b>.</>
        ) : (
          <span className="text-ok">✓ Learned {patternCount} patterns from {wordCount} words.</span>
        )}
      </div>

      {/* 3 — prediction table (the centerpiece) */}
      {!stale && prediction && (
        <div className="mt-3 rounded-md border border-border2 bg-panel p-3">
          <div className="text-[11.5px] text-txt3">
            After “<span className="text-txt2">{prediction.ctx || "…"}</span>”, the next word is probably:
          </div>
          {prediction.rows.length === 0 ? (
            <div className="mt-1.5 text-[11.5px] text-txt3">
              The model never saw those words together — it would jump to a spot it does know.
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {prediction.rows.map((r) => (
                <div key={r.token} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 truncate text-right text-[12px] font-medium text-txt2">{r.token}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel2">
                    <div className={PROMPT_BAR} style={{ width: `${Math.round(r.p * 100)}%` }} />
                  </div>
                  <span className="w-9 text-right text-[11.5px] text-txt3">{Math.round(r.p * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4 — generate */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-txt2">3. Write</span>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="start it off…"
          className="flex-1 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 outline-none focus:border-accent"
        />
        <button
          onClick={doGenerate}
          disabled={stale}
          className="inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" /> Generate
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-[11.5px] text-txt3">
        <span className="w-16 shrink-0">Creativity</span>
        <input
          type="range"
          min={0.2}
          max={1.5}
          step={0.1}
          value={temp}
          onChange={(e) => setTemp(Number(e.target.value))}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-14 text-right text-txt2">{temp <= 0.5 ? "careful" : temp >= 1.1 ? "wild" : "balanced"}</span>
      </label>

      {output && (
        <p className="mt-2 rounded-md border border-border2 bg-panel p-3 text-[13px] leading-relaxed text-txt">{output}</p>
      )}

      {memorizing && (
        <p className="mt-2 text-[11px] text-txt3">
          💡 Tiny bit of text + a big look-back = it just <b className="text-txt2">memorizes</b> and repeats. Real LLMs read
          billions of words, so they can mix things into something new.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-txt3">
          <Sparkles className="h-3 w-3" /> Same idea as ChatGPT — predict the next word — just much, much smaller.
        </span>
      </div>
    </div>
  );
}
