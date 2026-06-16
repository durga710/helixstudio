"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Wand2, RotateCcw, ArrowRight } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * PromptQuest — prompt engineering as a spell-casting game. Each challenge gives
 * a goal and a pile of "spell parts" (chips). The learner builds a prompt by
 * picking parts; a clear spell (all the key parts, no nonsense) succeeds, a vague
 * one misfires. Pure, deterministic scoring — no AI spend. Teaches: be specific,
 * add constraints, give a role; clearer instructions → better results.
 * Completes once every challenge is solved.
 */

type Role = "key" | "bonus" | "bad";
interface Part { text: string; role: Role }
interface Challenge {
  goal: string;
  parts: Part[];
  weak: string; // result when the spell is vague
  strong: string; // result when the spell is clear
}

const CHALLENGES: Challenge[] = [
  {
    goal: "Make the wizard attack the RIGHT enemy — without hurting friends.",
    parts: [
      { text: "Attack", role: "key" },
      { text: "the nearest enemy", role: "key" },
      { text: "avoid allies", role: "key" },
      { text: "use fire damage", role: "bonus" },
      { text: "do something cool", role: "bad" },
    ],
    weak: "“Attack!” — the wizard blasts in every direction and singes a teammate. 😵",
    strong: "Clear orders! The wizard hits the nearest enemy with fire and the allies stay safe. ✨",
  },
  {
    goal: "Summon the dragon you actually want.",
    parts: [
      { text: "Summon a dragon", role: "key" },
      { text: "friendly", role: "key" },
      { text: "protects the villagers", role: "key" },
      { text: "blue scales", role: "bonus" },
      { text: "whatever, surprise me", role: "bad" },
    ],
    weak: "“Summon a dragon.” — a random, grumpy dragon appears and chases the villagers. 🐉",
    strong: "A friendly blue dragon arrives and guards the village. You said exactly what you wanted. 🛡️",
  },
  {
    goal: "Give the AI a ROLE so its answer fits the audience.",
    parts: [
      { text: "Act as a kind science teacher", role: "key" },
      { text: "explain to a 10-year-old", role: "key" },
      { text: "use one simple example", role: "key" },
      { text: "keep it short", role: "bonus" },
      { text: "use big fancy words", role: "bad" },
    ],
    weak: "No role, no audience — you get a wall of jargon a kid can't follow. 📚",
    strong: "As a teacher for a 10-year-old, the AI gives a short, friendly answer with one clear example. 🎯",
  },
];

export function PromptQuest({ onComplete, onState }: WidgetProps) {
  const [level, setLevel] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [cast, setCast] = useState(false);
  const [solvedLevels, setSolvedLevels] = useState<Set<number>>(new Set());
  const completed = useRef(false);

  const ch = CHALLENGES[level];
  const totalKey = useMemo(() => ch.parts.filter((p) => p.role === "key").length, [ch]);

  const result = useMemo(() => {
    let keyHit = 0, bonus = 0, bad = 0;
    picked.forEach((i) => {
      const r = ch.parts[i]?.role;
      if (r === "key") keyHit++;
      else if (r === "bonus") bonus++;
      else if (r === "bad") bad++;
    });
    const clear = keyHit === totalKey && bad === 0;
    const clarity = Math.max(0, Math.min(100, Math.round((keyHit / totalKey) * 100 - bad * 35 + bonus * 5)));
    return { clear, clarity };
  }, [picked, ch, totalKey]);

  const allSolved = solvedLevels.size === CHALLENGES.length;

  useEffect(() => {
    onState?.({ level: level + 1, totalLevels: CHALLENGES.length, clarity: result.clarity, solved: solvedLevels.size, done: allSolved });
    if (allSolved && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, result.clarity, solvedLevels, allSolved]);

  function toggle(i: number) {
    if (cast) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function doCast() {
    setCast(true);
    if (result.clear) setSolvedLevels((s) => new Set(s).add(level));
  }

  function reset() {
    setPicked(new Set());
    setCast(false);
  }

  function nextLevel() {
    setLevel((l) => Math.min(CHALLENGES.length - 1, l + 1));
    setPicked(new Set());
    setCast(false);
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-txt3">
        <span className="rounded-full bg-panel px-2 py-0.5 text-accent">Spell {level + 1} / {CHALLENGES.length}</span>
        <span className="ml-auto">Solved {solvedLevels.size}/{CHALLENGES.length}</span>
      </div>
      <p className="mb-3 text-[13px] font-medium leading-relaxed text-txt">{ch.goal}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ch.parts.map((p, i) => {
          const on = picked.has(i);
          const reveal = cast && on;
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              disabled={cast}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors disabled:cursor-default"
              style={
                reveal
                  ? p.role === "bad"
                    ? { borderColor: "var(--bad)", color: "var(--txt)" }
                    : { borderColor: "var(--ok)", color: "var(--txt)" }
                  : on
                    ? { borderColor: "var(--accent)", color: "var(--txt)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }
                    : { borderColor: "var(--border2)", color: "var(--txt2)" }
              }
            >
              {reveal && (p.role === "bad" ? <X className="h-3.5 w-3.5 text-bad" /> : <Check className="h-3.5 w-3.5 text-ok" />)}
              {p.text}
            </button>
          );
        })}
      </div>

      {/* Live clarity meter */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-txt3">
          <span>Spell clarity</span>
          <span className="tabular-nums text-txt2">{result.clarity}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${result.clarity}%`, background: result.clarity > 70 ? "var(--ok)" : "var(--accent)" }} />
        </div>
      </div>

      {!cast ? (
        <button
          onClick={doCast}
          disabled={picked.size === 0}
          className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40"
        >
          <Wand2 className="h-4 w-4" /> Cast the spell
        </button>
      ) : (
        <div>
          <div
            className="rounded-[10px] border px-3.5 py-3 text-[13px] leading-relaxed"
            style={result.clear ? { borderColor: "color-mix(in srgb, var(--ok) 45%, transparent)", color: "var(--txt2)" } : { borderColor: "color-mix(in srgb, var(--bad) 45%, transparent)", color: "var(--txt2)" }}
          >
            {result.clear ? ch.strong : ch.weak}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {result.clear ? (
              level < CHALLENGES.length - 1 ? (
                <button onClick={nextLevel} className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110">
                  Next spell <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="text-[12.5px] font-medium text-ok">All spells mastered — clear instructions win! →</span>
              )
            ) : (
              <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel px-3 py-2 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
                <RotateCcw className="h-3.5 w-3.5" /> Rewrite the spell
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
