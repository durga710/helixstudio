"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Plus, Sparkles } from "lucide-react";
import { initNet, forward, trainEpochs, accuracyOf, type Net, type Sample } from "@/lib/lab/mlp";
import type { GameShape } from "@/lib/lessons/games";
import type { GameProps } from "./index";

/*
 * Teach-the-Robot — the flagship learn-ML-by-playing game. Robo's "brain" is a
 * REAL tiny neural net (src/lib/lab/mlp). The kid does two big things: press
 * TRAIN (watch the field's colors morph as Robo learns + Robo react) and, when
 * stuck, ➕ give Robo another brain cell (a hidden neuron). One brain cell can
 * only think in a straight line and fails on bendy shapes; more brain cells bend
 * the boundary into a curve. Reach 90% and Robo "gets it" → the shell celebrates.
 */

const GOAL = 0.9;
const MAX_BRAIN = 8;
const SIZE = 300;
const GRID = 20;
const EPOCHS_PER_TICK = 20;
const MAX_ROUNDS = 900;
const TREASURE = "#00e0c0"; // teal
const ROCK = "#ff004d"; // red

/* ---- per-level data (in [-1,1]) ---- */
function jitter(cx: number, cy: number, n: number, y: number, spread = 0.16, seedShift = 0): Sample[] {
  // deterministic-ish spread (pseudo-grid) so every play of a level looks the same
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 2.3994 + seedShift) % (Math.PI * 2);
    const r = spread * (0.4 + ((i * 7) % 5) / 5);
    return { x: [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number], y };
  });
}

function makeData(shape: GameShape): Sample[] {
  switch (shape) {
    case "twoBlobs": // one straight line splits it — 1 brain cell wins
      return [...jitter(-0.5, -0.5, 9, 1), ...jitter(0.5, 0.5, 9, 0)];
    case "oneBend": // an L-shaped corner — needs a bend (a couple brain cells)
      return [
        ...jitter(-0.55, -0.55, 8, 1, 0.22),
        ...jitter(0.5, -0.5, 5, 0),
        ...jitter(-0.5, 0.5, 5, 0),
        ...jitter(0.5, 0.5, 5, 0),
      ];
    case "ring": // a core wrapped by a ring — needs several brain cells
      return [
        ...jitter(0, 0, 9, 1, 0.22),
        ...Array.from({ length: 12 }, (_, i) => {
          const ang = (i / 12) * Math.PI * 2;
          return { x: [0.85 * Math.cos(ang), 0.85 * Math.sin(ang)] as [number, number], y: 0 };
        }),
      ];
    case "spiral": // checkerboard (XOR x2) — the trickiest, more brain cells
      return [
        ...jitter(-0.55, -0.55, 5, 1),
        ...jitter(0.55, 0.55, 5, 1),
        ...jitter(-0.55, 0.55, 5, 0),
        ...jitter(0.55, -0.55, 5, 0),
        ...jitter(0, 0, 4, 1, 0.12),
      ];
    case "newField": // a fresh, friendly shape — the victory lap
      return [...jitter(-0.45, 0.5, 8, 1), ...jitter(0.5, -0.45, 8, 0)];
  }
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const toPx = (v: number) => ((v + 1.15) / 2.3) * SIZE;

export function TeachTheRobot({ level, onWin, onState }: GameProps) {
  const data = useMemo(() => makeData(level.shape), [level.shape]);
  const [h, setH] = useState(1);
  const [net, setNet] = useState<Net>(() => initNet(1));
  const [round, setRound] = useState(0);
  const [training, setTraining] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const won = useRef(false);

  const acc = useMemo(() => accuracyOf(net, data), [net, data]);
  const wrongCount = useMemo(() => data.filter((d) => (forward(net, d.x).out > 0.5 ? 1 : 0) !== d.y).length, [net, data]);
  const accPct = Math.round(acc * 100);
  const settledLow = round > 0 && !training && acc < GOAL;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setTraining(false);
  }, []);

  // Win + report state.
  useEffect(() => {
    let mood: string;
    if (acc >= GOAL) mood = "Robo learned the shape!";
    else if (training) mood = "Robo is thinking…";
    else if (settledLow) mood = h < MAX_BRAIN ? "Robo is stuck — give it another brain cell!" : "So close — train Robo again!";
    else mood = "Press TRAIN to teach Robo!";
    onState?.({ brainCells: h, accuracy: accPct, wrong: wrongCount, training, narration: mood });
    if (acc >= GOAL && !won.current) {
      won.current = true;
      stop();
      const t = setTimeout(onWin, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accPct, wrongCount, training, h]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  function train() {
    if (training || won.current) return;
    setTraining(true);
    let working = net;
    let r = round;
    timer.current = setInterval(() => {
      working = trainEpochs(working, data, EPOCHS_PER_TICK);
      r += EPOCHS_PER_TICK;
      setNet(working);
      setRound(r);
      if (accuracyOf(working, data) >= GOAL || r >= MAX_ROUNDS) stop();
    }, 60);
  }

  function addBrain() {
    if (h >= MAX_BRAIN || training) return;
    stop();
    const nh = h + 1;
    setH(nh);
    setNet(initNet(nh));
    setRound(0);
  }

  // Decision-boundary heatmap (Robo's "mind").
  const cells = useMemo(() => {
    const out: { x: number; y: number; s: number; fill: string }[] = [];
    const step = 2.3 / GRID;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x = -1.15 + step * (i + 0.5);
        const y = -1.15 + step * (j + 0.5);
        const p = forward(net, [x, y]).out;
        out.push({ x: (i / GRID) * SIZE, y: SIZE - ((j + 1) / GRID) * SIZE, s: SIZE / GRID + 1, fill: hexLerp(ROCK, TREASURE, p) });
      }
    }
    return out;
  }, [net]);

  const face = acc >= GOAL ? "🤖" : training ? "🤖" : settledLow ? "🤖" : "🤖";
  const mood = acc >= GOAL ? "😄" : training ? "💭" : settledLow ? "😅" : "🙂";
  const speech = acc >= GOAL
    ? "I did it! I learned the shape! 🎉"
    : training
      ? "Thinking really hard…"
      : settledLow
        ? h < MAX_BRAIN
          ? "I'm stuck! Give me another brain cell 🧠"
          : "So close! Train me again 💪"
        : "Press TRAIN to teach me!";

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {/* Robo + speech */}
      <div className="mb-3 flex items-center gap-3">
        <span className={`relative text-4xl ${training ? "animate-bounce" : ""}`}>
          {face}
          <span className="absolute -bottom-1 -right-1 text-lg">{mood}</span>
        </span>
        <div className="relative flex-1 rounded-2xl border border-border2 bg-panel px-3.5 py-2 text-[14px] font-medium text-txt">
          {speech}
        </div>
      </div>

      {/* "How sure Robo is" bar */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="shrink-0 text-[12px] text-txt3">How sure Robo is</span>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-panel">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${accPct}%`, background: acc >= GOAL ? "var(--ok)" : "var(--accent)" }}
          />
        </div>
        <span className="w-9 shrink-0 text-right text-[12px] font-bold" style={{ color: acc >= GOAL ? "var(--ok)" : "var(--txt)" }}>{accPct}%</span>
      </div>

      {/* The field — Robo's mind + the dots */}
      <div className="overflow-hidden rounded-xl border border-border2 bg-panel">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block w-full">
          {cells.map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width={c.s} height={c.s} fill={c.fill} opacity={0.5} />
          ))}
          {data.map((d, i) => {
            const wrong = (forward(net, d.x).out > 0.5 ? 1 : 0) !== d.y;
            return (
              <g key={i}>
                {wrong && <circle cx={toPx(d.x[0])} cy={SIZE - toPx(d.x[1])} r={9} fill="none" stroke="#fff" strokeWidth={1.5} className={training ? "animate-pulse" : ""} />}
                <circle cx={toPx(d.x[0])} cy={SIZE - toPx(d.x[1])} r={6} fill={d.y === 1 ? TREASURE : ROCK} stroke="#0d1626" strokeWidth={1.5} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-4 text-[11px] text-txt3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TREASURE }} /> treasure</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ROCK }} /> rocks</span>
        <span>{wrongCount === 0 ? "all sorted! 🎉" : `${wrongCount} still mixed up`}</span>
      </div>

      {/* Brain cells */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        <span className="text-[12px] text-txt3">Robo&apos;s brain:</span>
        {Array.from({ length: h }).map((_, i) => (
          <Brain key={i} className="h-4 w-4 text-accent" strokeWidth={2} />
        ))}
        <span className="text-[12px] font-semibold text-txt2">{h}</span>
      </div>

      {/* Big buttons */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          onClick={addBrain}
          disabled={h >= MAX_BRAIN || training}
          className="inline-flex items-center justify-center gap-2 rounded-[14px] border-2 border-border2 bg-panel px-4 py-3.5 text-[15px] font-bold text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-40"
        >
          <Plus className="h-5 w-5" /> Brain cell
        </button>
        <button
          onClick={train}
          disabled={training || acc >= GOAL}
          className="inline-flex items-center justify-center gap-2 rounded-[14px] border-none bg-accent px-4 py-3.5 text-[16px] font-extrabold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
        >
          <Sparkles className="h-5 w-5" /> {training ? "Thinking…" : "TRAIN"}
        </button>
      </div>
    </div>
  );
}
