"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Sparkles, Lock, Check, StepForward } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset, CLASS_COLORS } from "@/components/lab/datasets";

/*
 * NeuronBoundary — the guided "how a neuron learns" lab, ONE widget driven
 * through phases by `config.phase`. Every phase shares the SAME line/weights +
 * perceptron math, so the learner sees one consistent object the whole way:
 *   explore    — drag a line by hand to split two groups; lock your best.
 *   step       — train ONE round per button press; watch the line nudge.
 *   reveal     — from a bad line, the neuron auto-tunes until almost none wrong.
 *   generalize — train on "studied" points, score on held-out NEW points (hollow).
 *   youdo      — fresh data, no hints: set a rough line, press Train.
 *   fail       — a ring the line CAN'T cut; it plateaus, motivating networks.
 * Each phase reliably fires onComplete (centralized below) so Next always unlocks.
 */

const W = 340;
const H = 252;
const PAD = 28;
const DMAX = 10;
const LR = 0.08;
/** A deliberately-wrong starting line, so learning is visible. */
const REVEAL_INIT: Weights = { w1: 1, w2: 1, bias: -3 };
const STEP_TARGET_ROUNDS = 8;

type Phase = "explore" | "step" | "reveal" | "generalize" | "youdo" | "fail";

interface Weights {
  w1: number;
  w2: number;
  bias: number;
}

export function NeuronBoundary({ config, onComplete, onState }: WidgetProps) {
  const phase = (typeof config?.phase === "string" ? config.phase : "explore") as Phase;
  const isManual = phase === "explore" || phase === "youdo";
  const isStep = phase === "step";
  const isGeneralize = phase === "generalize";
  const defaultDs = phase === "youdo" ? "boundaryEasy" : phase === "fail" ? "ring" : "boundary";
  const ds = getDataset(typeof config?.dataset === "string" ? config.dataset : defaultDs);
  const target = typeof config?.target === "number" ? config.target : 0.92;
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1];

  // Train/test split for "generalize": every 3rd point is held out as a NEW
  // (test) point the neuron never studies.
  const isTest = useCallback((i: number) => isGeneralize && i % 3 === 2, [isGeneralize]);
  const trainPoints = useMemo(() => ds.points.filter((_, i) => !isTest(i)), [ds, isTest]);
  const testPoints = useMemo(() => ds.points.filter((_, i) => isTest(i)), [ds, isTest]);

  // Manual line: two draggable endpoints (y at x=0 and x=DMAX), in data units.
  const [yL, setYL] = useState(4);
  const [yR, setYR] = useState(6);
  // Trained line (step / reveal / generalize / youdo-after-Train / fail).
  const [weights, setWeights] = useState<Weights>(REVEAL_INIT);
  const [mode, setMode] = useState<"manual" | "idle" | "running" | "stepping" | "settled">(isManual ? "manual" : "idle");
  const [rounds, setRounds] = useState(0);
  const [locked, setLocked] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<"L" | "R" | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const trained = useRef<Weights>(REVEAL_INIT);
  const completed = useRef(false);

  const sx = (x: number) => PAD + (x / DMAX) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / DMAX) * (H - PAD * 2);

  // The line on screen, as weights. Manual mode derives it from the two endpoints
  // (w2 fixed = 1); every other mode shows the trained weights directly.
  const lineWeights = useMemo<Weights>(() => {
    if (mode !== "manual") return weights;
    return { w1: (yL - yR) / DMAX, w2: 1, bias: -yL };
  }, [mode, weights, yL, yR]);

  const score = (wt: Weights, x: number, y: number) => wt.w1 * x + wt.w2 * y + wt.bias;
  const accOn = useCallback(
    (wt: Weights, pts: typeof ds.points) => {
      if (pts.length === 0) return 1;
      let ok = 0;
      for (const p of pts) {
        const pred = score(wt, p.features[fx], p.features[fy]) > 0 ? 1 : 0;
        if (pred === ds.classes.indexOf(p.label)) ok++;
      }
      return ok / pts.length;
    },
    [ds, fx, fy],
  );
  const accRaw = useCallback((wt: Weights) => accOn(wt, ds.points), [accOn, ds.points]);

  // Manual orientation is ambiguous (either side could be class 1), so score the
  // better of the two — the learner isn't punished for which way they drew it.
  const flipped = mode === "manual" && accRaw(lineWeights) < 0.5;
  const acc = mode === "manual" ? Math.max(accRaw(lineWeights), 1 - accRaw(lineWeights)) : accRaw(lineWeights);
  const accPct = Math.round(acc * 100);
  const accTrainPct = Math.round(accOn(lineWeights, trainPoints) * 100);
  const accTestPct = Math.round(accOn(lineWeights, testPoints) * 100);

  const predClassOf = (x: number, y: number) => {
    const raw = score(lineWeights, x, y) > 0 ? 1 : 0;
    return flipped ? 1 - raw : raw;
  };
  const wrong = (x: number, y: number, label: string) => predClassOf(x, y) !== ds.classes.indexOf(label);
  const wrongCount = ds.points.filter((p) => wrong(p.features[fx], p.features[fy], p.label)).length;

  // One perceptron pass over a set of points: nudge weights toward each mistake.
  const onePassOn = useCallback(
    (wt: Weights, pts: typeof ds.points): Weights => {
      const cur = { ...wt };
      for (const p of pts) {
        const x = p.features[fx];
        const y = p.features[fy];
        const err = ds.classes.indexOf(p.label) - (score(cur, x, y) > 0 ? 1 : 0);
        cur.w1 += LR * err * x;
        cur.w2 += LR * err * y;
        cur.bias += LR * err;
      }
      return cur;
    },
    [ds, fx, fy],
  );

  // Report live state + fire completion EXACTLY once per phase (centralized).
  useEffect(() => {
    onState?.({ phase, accuracy: accPct, wrong: wrongCount, rounds, locked, testAccuracy: accTestPct });
    if (completed.current) return;
    let done = false;
    if (phase === "youdo") done = mode !== "running" && acc >= target && rounds > 0;
    else if (phase === "reveal" || phase === "generalize" || phase === "fail") done = mode === "settled";
    else if (phase === "step") done = mode === "stepping" && ((acc >= target && rounds >= 3) || rounds >= STEP_TARGET_ROUNDS);
    if (done) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accPct, accTestPct, wrongCount, rounds, mode, locked]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  // ---- drag the endpoints (manual phases) ----
  const clientYToData = (clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const localY = ((clientY - rect.top) / rect.height) * H;
    const dataY = ((H - PAD - localY) / (H - PAD * 2)) * DMAX;
    return Math.max(0, Math.min(DMAX, dataY));
  };
  const onHandleDown = (e: React.PointerEvent<SVGCircleElement>) => {
    if (mode !== "manual") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = (e.currentTarget.dataset.side as "L" | "R") ?? null;
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current || mode !== "manual") return;
    const y = clientYToData(e.clientY);
    if (drag.current === "L") setYL(y);
    else setYR(y);
  };
  const onHandleUp = () => {
    drag.current = null;
  };

  // ---- auto training run (reveal / generalize / fail) ----
  function runTraining(from: Weights) {
    if (mode === "running") return;
    // Orient so "above = class 1" matches the better reading of the studied pts.
    let start = from;
    if (accOn(start, trainPoints) < 0.5) start = { w1: -start.w1, w2: -start.w2, bias: -start.bias };
    trained.current = start;
    setWeights(start);
    setMode("running");
    setRounds(0);
    let steps = 0;
    timer.current = setInterval(() => {
      steps++;
      const cur = onePassOn(trained.current, trainPoints);
      trained.current = cur;
      setWeights(cur);
      setRounds((r) => r + 1);
      // Stop when it can't improve (perfect on training, or run out of rounds).
      // A ring never reaches 100%, so the round cap is what ends "fail".
      if (accOn(cur, trainPoints) === 1 || steps > 80) {
        if (timer.current) clearInterval(timer.current);
        setMode("settled");
      }
    }, 90);
  }

  // ---- one round per press (step) ----
  function stepOnce() {
    const cur = onePassOn(trained.current, trainPoints);
    trained.current = cur;
    setWeights(cur);
    setRounds((r) => r + 1);
    setMode("stepping");
  }

  function reset() {
    if (timer.current) clearInterval(timer.current);
    completed.current = false;
    setRounds(0);
    setLocked(false);
    trained.current = REVEAL_INIT;
    if (isManual) {
      setMode("manual");
      setYL(4);
      setYR(6);
    } else {
      setMode("idle");
      setWeights(REVEAL_INIT);
    }
  }

  // Endpoint screen positions for the current line.
  const lineYAt = (x: number) => {
    const wt = lineWeights;
    return Math.abs(wt.w2) < 1e-6 ? NaN : -(wt.w1 * x + wt.bias) / wt.w2;
  };
  const clampScreenY = (yv: number, fb: number) => Math.max(4, Math.min(H - 4, Number.isFinite(yv) ? sy(yv) : fb));
  const lx0 = clampScreenY(lineYAt(0), H);
  const lx1 = clampScreenY(lineYAt(DMAX), 0);
  const showHandles = mode === "manual";
  const running = mode === "running";
  const showRounds = mode === "running" || mode === "stepping" || mode === "settled";
  const showReset = isManual || mode === "settled" || (isStep && rounds > 0);
  const accColor = acc >= target ? "var(--ok)" : undefined;

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {/* Readout */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {isGeneralize && showRounds ? (
          <>
            <span className="text-txt3">
              On pets it studied: <b className="text-txt">{accTrainPct}%</b>
            </span>
            <span className="text-txt3">
              On NEW pets: <b className="text-txt" style={{ color: accTestPct >= 80 ? "var(--ok)" : undefined }}>{accTestPct}%</b>
            </span>
          </>
        ) : (
          <>
            <span className="text-txt3">
              On the right side: <b className="text-txt" style={{ color: accColor }}>{accPct}%</b>
            </span>
            <span className="text-txt3">
              wrong: <b className="text-txt2" style={{ color: wrongCount === 0 ? "var(--ok)" : "var(--bad)" }}>{wrongCount}</b>
            </span>
          </>
        )}
        {showRounds && <span className="ml-auto text-txt3">rounds: <b className="text-txt2">{rounds}</b></span>}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-md border border-border2 bg-panel"
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
      >
        {/* axes */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <text x={W - PAD} y={H - PAD + 14} textAnchor="end" fontSize={9} fill="#5b6b87">{fx} →</text>
        <text x={PAD - 6} y={PAD - 6} textAnchor="start" fontSize={9} fill="#5b6b87">{fy} ↑</text>

        {/* the decision boundary */}
        <line x1={sx(0)} y1={lx0} x2={sx(DMAX)} y2={lx1} stroke="#c084fc" strokeWidth={2.5} strokeLinecap="round" />
        {showRounds && (
          <text x={sx(DMAX) - 4} y={lx1 - 6} textAnchor="end" fontSize={9} fill="#c084fc">decision boundary</text>
        )}

        {/* points — true color; held-out (test) points are hollow; a ring marks wrong ones */}
        {ds.points.map((p, i) => {
          const ci = ds.classes.indexOf(p.label);
          const color = CLASS_COLORS[ci % CLASS_COLORS.length];
          const isWrong = wrong(p.features[fx], p.features[fy], p.label);
          const test = isTest(i);
          return (
            <g key={i}>
              {isWrong && (
                <circle
                  cx={sx(p.features[fx])}
                  cy={sy(p.features[fy])}
                  r={8}
                  fill="none"
                  stroke="var(--bad)"
                  strokeWidth={1.5}
                  className={running ? "animate-pulse" : undefined}
                />
              )}
              <circle
                cx={sx(p.features[fx])}
                cy={sy(p.features[fy])}
                r={5}
                fill={test ? "var(--panel)" : color}
                fillOpacity={test ? 1 : 0.92}
                stroke={test ? color : "none"}
                strokeWidth={test ? 2 : 0}
              />
            </g>
          );
        })}

        {/* draggable endpoints (manual phases only) */}
        {showHandles && (
          <>
            <circle data-side="L" cx={sx(0)} cy={lx0} r={9} fill="#c084fc" fillOpacity={0.25} stroke="#c084fc" strokeWidth={2} className="cursor-ns-resize" onPointerDown={onHandleDown} />
            <circle data-side="R" cx={sx(DMAX)} cy={lx1} r={9} fill="#c084fc" fillOpacity={0.25} stroke="#c084fc" strokeWidth={2} className="cursor-ns-resize" onPointerDown={onHandleDown} />
          </>
        )}
      </svg>

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-txt3">
        {ds.classes.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
            {c}
          </span>
        ))}
        {isGeneralize && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-txt3 bg-panel" /> new (never seen)
          </span>
        )}
        {showHandles && <span className="ml-auto text-txt3">drag the two purple dots to swing the line</span>}
      </div>

      {/* controls */}
      <div className="mt-3 flex items-center gap-2">
        {showReset && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}

        {phase === "explore" && (
          <button
            onClick={() => {
              setLocked(true);
              if (!completed.current) {
                completed.current = true;
                onComplete();
              }
            }}
            disabled={locked}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" /> {locked ? "Locked in" : "Lock in my line"}
          </button>
        )}

        {isStep && (
          <button
            onClick={stepOnce}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110"
          >
            <StepForward className="h-3.5 w-3.5" /> Run one round
          </button>
        )}

        {phase === "reveal" && (
          <button
            onClick={() => runTraining(REVEAL_INIT)}
            disabled={running}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {running ? "Learning…" : mode === "settled" ? "Run again" : "Watch it learn"}
          </button>
        )}

        {isGeneralize && (
          <button
            onClick={() => runTraining(REVEAL_INIT)}
            disabled={running}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {running ? "Studying…" : mode === "settled" ? "Train again" : "Train on the studied pets"}
          </button>
        )}

        {phase === "youdo" && (
          <button
            onClick={() => runTraining(lineWeights)}
            disabled={running}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {running ? "Training…" : "Train my neuron"}
          </button>
        )}

        {phase === "fail" && (
          <button
            onClick={() => runTraining(REVEAL_INIT)}
            disabled={running}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {running ? "Trying…" : mode === "settled" ? "Try again" : "Let it try"}
          </button>
        )}
      </div>

      <Takeaway
        phase={phase}
        mode={mode}
        locked={locked}
        wrongCount={wrongCount}
        acc={acc}
        accTestPct={accTestPct}
        rounds={rounds}
        target={target}
      />
    </div>
  );
}

function Takeaway({
  phase,
  mode,
  locked,
  wrongCount,
  acc,
  accTestPct,
  rounds,
  target,
}: {
  phase: Phase;
  mode: string;
  locked: boolean;
  wrongCount: number;
  acc: number;
  accTestPct: number;
  rounds: number;
  target: number;
}) {
  let text: string | null = null;
  let good = false;
  const settled = mode === "settled";

  if (phase === "explore") {
    text = locked
      ? wrongCount === 0
        ? "Nice — you got them all! Most real data is messier, though. Next, watch a neuron tune a line on its own. →"
        : `You locked in your best line — but ${wrongCount} ${wrongCount === 1 ? "dot is" : "dots are"} still on the wrong side. By hand, that's about as good as it gets. So how does a neuron do better? →`
      : "Drag the two purple dots to swing the line until the groups are on different sides. Get the wrong count as low as you can, then lock it in.";
    good = locked && wrongCount === 0;
  } else if (phase === "step") {
    text =
      rounds === 0
        ? "Press “Run one round”. Each press, the neuron looks at its mistakes and nudges the line a little."
        : acc >= target
          ? "See? A handful of tiny nudges and it sorted them. That's all learning is — repeat until it's right."
          : `Round ${rounds}: the line moved and the wrong count dropped. Keep pressing.`;
    good = acc >= target && rounds >= 3;
  } else if (phase === "reveal") {
    text = settled
      ? "Each round, every dot on the wrong side nudged the line a little — until almost none were left. That self-nudging IS learning."
      : mode === "running"
        ? "Watch the line tilt after each mistake…"
        : "Press “Watch it learn”. The line starts off bad on purpose — then fixes itself.";
    good = settled;
  } else if (phase === "generalize") {
    text = settled
      ? accTestPct >= 80
        ? `It scored ${accTestPct}% on pets it NEVER studied. That means it learned the real idea — it didn't just memorize. That's called generalizing.`
        : "It did great on studied pets but stumbled on new ones — a sign it memorized more than it learned."
      : "The hollow dots are NEW pets — the neuron never sees them while training. Press Train, then check how it does on those.";
    good = settled && accTestPct >= 80;
  } else if (phase === "youdo") {
    text =
      acc >= target && mode !== "manual"
        ? "You did it — your neuron split them on its own. 🎉 You just trained a real one from scratch."
        : "Your turn, no hints: set a rough line, then press “Train my neuron” and watch it finish the job.";
    good = acc >= target && mode !== "manual";
  } else if (phase === "fail") {
    text = settled
      ? "No matter how it tilts, one straight line can't wrap a ring — it's stuck. THIS is why we wire many neurons together: their lines combine into curves."
      : mode === "running"
        ? "It's trying every angle it can…"
        : "This time the dots make a ring. Press “Let it try” and see if one straight line can ever split it.";
    good = settled; // a successful "aha", even though accuracy stays low
  }

  if (!text) return null;
  return (
    <p className={`mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed ${good ? "text-ok" : "text-txt3"}`}>
      {good && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1">{text}</span>
    </p>
  );
}
