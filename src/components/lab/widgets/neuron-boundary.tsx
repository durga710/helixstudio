"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Sparkles, Lock, Check } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset, CLASS_COLORS } from "@/components/lab/datasets";

/*
 * NeuronBoundary — the guided "how a neuron learns" lab, one widget driven
 * through three phases by `config.phase`:
 *   explore — the learner drags a line by hand to split two groups, and sees a
 *             few stragglers stay on the wrong side (a hand-drawn line can't be
 *             perfect). Completes when they LOCK their best line.
 *   reveal  — from a deliberately-bad line, the neuron nudges its own line after
 *             every misclassified dot (which flash) until almost none are left.
 *             The "decision boundary" + "weights" get named here. Completes when
 *             the self-training run finishes.
 *   youdo   — fresh, cleanly-separable data, scaffolds removed: set a rough line,
 *             press Train, watch your own neuron finish the job. Completes at the
 *             target accuracy.
 * Shared mechanic across all three: the SAME line/weights math, so the learner
 * sees one consistent object the whole way through.
 */

const W = 340;
const H = 252;
const PAD = 28;
const DMAX = 10;
const LR = 0.08;
/** A deliberately-wrong starting line for the reveal, so learning is visible. */
const REVEAL_INIT: Weights = { w1: 1, w2: 1, bias: -3 };

type Phase = "explore" | "reveal" | "youdo";

interface Weights {
  w1: number;
  w2: number;
  bias: number;
}

export function NeuronBoundary({ config, onComplete, onState }: WidgetProps) {
  const phase = (typeof config?.phase === "string" ? config.phase : "explore") as Phase;
  const manual = phase !== "reveal";
  const defaultDs = phase === "youdo" ? "boundaryEasy" : "boundary";
  const ds = getDataset(typeof config?.dataset === "string" ? config.dataset : defaultDs);
  const target = typeof config?.target === "number" ? config.target : 0.92;
  const fx = ds.featureNames[0];
  const fy = ds.featureNames[1];

  // Manual line: two draggable endpoints (y at x=0 and x=DMAX), in data units.
  const [yL, setYL] = useState(4);
  const [yR, setYR] = useState(6);
  // Trained line (reveal / youdo-after-Train).
  const [weights, setWeights] = useState<Weights>(REVEAL_INIT);
  const [mode, setMode] = useState<"manual" | "idle" | "running" | "settled">(manual ? "manual" : "idle");
  const [rounds, setRounds] = useState(0);
  const [locked, setLocked] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<"L" | "R" | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const trained = useRef<Weights>(REVEAL_INIT);
  const completed = useRef(false);

  const sx = (x: number) => PAD + (x / DMAX) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / DMAX) * (H - PAD * 2);

  // The line currently on screen, as weights. Manual mode derives weights from
  // the two endpoints (w2 fixed = 1, so the line is always a tilt of y = f(x)).
  const lineWeights = useMemo<Weights>(() => {
    // Manual phases derive the line from the two draggable endpoints; every other
    // mode (reveal's idle start, training, settled) shows the weights directly.
    if (mode !== "manual") return weights;
    return { w1: (yL - yR) / DMAX, w2: 1, bias: -yL };
  }, [mode, weights, yL, yR]);

  const score = (wt: Weights, x: number, y: number) => wt.w1 * x + wt.w2 * y + wt.bias;
  const accRaw = useCallback(
    (wt: Weights) => {
      let ok = 0;
      for (const p of ds.points) {
        const pred = score(wt, p.features[fx], p.features[fy]) > 0 ? 1 : 0;
        if (pred === ds.classes.indexOf(p.label)) ok++;
      }
      return ok / ds.points.length;
    },
    [ds, fx, fy],
  );

  // In manual mode the line's orientation is ambiguous (either side could be
  // "cats"), so we score the better of the two orientations — the learner is
  // never punished for which way round they drew it.
  const flipped = mode === "manual" && accRaw(lineWeights) < 0.5;
  const acc = mode === "manual" ? Math.max(accRaw(lineWeights), 1 - accRaw(lineWeights)) : accRaw(lineWeights);
  const accPct = Math.round(acc * 100);

  const predClassOf = (x: number, y: number) => {
    const raw = score(lineWeights, x, y) > 0 ? 1 : 0;
    return flipped ? 1 - raw : raw;
  };
  const wrong = (x: number, y: number, label: string) => predClassOf(x, y) !== ds.classes.indexOf(label);
  const wrongCount = ds.points.filter((p) => wrong(p.features[fx], p.features[fy], p.label)).length;

  // One perceptron pass: nudge the weights toward each misclassified point.
  const onePass = useCallback(
    (wt: Weights): Weights => {
      const cur = { ...wt };
      for (const p of ds.points) {
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

  // Report live state to the tutor + fire completion exactly once per phase.
  useEffect(() => {
    onState?.({ phase, accuracy: accPct, wrong: wrongCount, rounds, locked });
    if (phase === "youdo" && (mode === "running" ? false : acc >= target) && rounds > 0 && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accPct, wrongCount, rounds, mode, locked]);

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

  // ---- training run (reveal + youdo) ----
  function runTraining(from: Weights) {
    if (mode === "running") return;
    // Orient the starting line so "above = class 1" matches the better reading,
    // so a learner's hand-drawn line keeps its accuracy as training begins.
    let start = from;
    if (accRaw(start) < 0.5) start = { w1: -start.w1, w2: -start.w2, bias: -start.bias };
    trained.current = start;
    setWeights(start);
    setMode("running");
    setRounds(0);
    let steps = 0;
    timer.current = setInterval(() => {
      steps++;
      const cur = onePass(trained.current);
      trained.current = cur;
      setWeights(cur);
      setRounds((r) => r + 1);
      if (accRaw(cur) === 1 || steps > 80) {
        if (timer.current) clearInterval(timer.current);
        setMode("settled");
        if (phase === "reveal" && !completed.current) {
          completed.current = true;
          onComplete();
        }
      }
    }, 90);
  }

  function reset() {
    if (timer.current) clearInterval(timer.current);
    completed.current = false;
    setRounds(0);
    setLocked(false);
    if (manual) {
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

  const accColor = acc >= target ? "var(--ok)" : undefined;

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {/* Readout */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="text-txt3">
          On the right side: <b className="text-txt" style={{ color: accColor }}>{accPct}%</b>
        </span>
        <span className="text-txt3">
          wrong: <b className="text-txt2" style={{ color: wrongCount === 0 ? "var(--ok)" : "var(--bad)" }}>{wrongCount}</b>
        </span>
        {(mode === "running" || mode === "settled") && (
          <span className="ml-auto text-txt3">rounds: <b className="text-txt2">{rounds}</b></span>
        )}
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
        <line
          x1={sx(0)}
          y1={lx0}
          x2={sx(DMAX)}
          y2={lx1}
          stroke="#c084fc"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {(mode === "running" || mode === "settled") && (
          <text x={sx(DMAX) - 4} y={lx1 - 6} textAnchor="end" fontSize={9} fill="#c084fc">decision boundary</text>
        )}

        {/* points — true color; a ring marks ones on the wrong side */}
        {ds.points.map((p, i) => {
          const ci = ds.classes.indexOf(p.label);
          const isWrong = wrong(p.features[fx], p.features[fy], p.label);
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
                  className={mode === "running" ? "animate-pulse" : undefined}
                />
              )}
              <circle cx={sx(p.features[fx])} cy={sy(p.features[fy])} r={5} fill={CLASS_COLORS[ci % CLASS_COLORS.length]} fillOpacity={0.92} />
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
      <div className="mt-2 flex items-center gap-3 text-[11px] text-txt3">
        {ds.classes.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
            {c}
          </span>
        ))}
        {showHandles && <span className="ml-auto text-txt3">drag the two purple dots to swing the line</span>}
      </div>

      {/* controls */}
      <div className="mt-3 flex items-center gap-2">
        {(manual || mode === "settled") && (
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

        {phase === "reveal" && (
          <button
            onClick={() => runTraining(REVEAL_INIT)}
            disabled={mode === "running"}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {mode === "running" ? "Learning…" : mode === "settled" ? "Run again" : "Watch it learn"}
          </button>
        )}

        {phase === "youdo" && (
          <button
            onClick={() => runTraining(lineWeights)}
            disabled={mode === "running"}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {mode === "running" ? "Training…" : "Train my neuron"}
          </button>
        )}
      </div>

      {/* phase-specific takeaway */}
      <Takeaway phase={phase} mode={mode} locked={locked} wrongCount={wrongCount} acc={acc} target={target} />
    </div>
  );
}

function Takeaway({
  phase,
  mode,
  locked,
  wrongCount,
  acc,
  target,
}: {
  phase: Phase;
  mode: string;
  locked: boolean;
  wrongCount: number;
  acc: number;
  target: number;
}) {
  let text: string | null = null;
  let good = false;
  if (phase === "explore") {
    text = locked
      ? wrongCount === 0
        ? "Nice — you got them all! Most real data is messier, though. Next, watch a neuron tune a line on its own. →"
        : `You locked in your best line — but ${wrongCount} ${wrongCount === 1 ? "dot is" : "dots are"} still on the wrong side. By hand, that's about as good as it gets. So how does a neuron do better? →`
      : "Drag the two purple dots to swing the line until cats and dogs are on different sides. Get the count of wrong ones as low as you can, then lock it in.";
    good = locked && wrongCount === 0;
  } else if (phase === "reveal") {
    text =
      mode === "settled"
        ? "See what happened? Each round, every dot on the wrong side nudged the line a little — until almost none were left. That self-nudging IS learning."
        : mode === "running"
          ? "Watch the line tilt after each mistake…"
          : "Press “Watch it learn”. The line starts off bad on purpose — then fixes itself.";
    good = mode === "settled";
  } else {
    text =
      acc >= target && mode !== "manual"
        ? "You did it — your neuron split them on its own. 🎉 You just trained a real one from scratch."
        : "Your turn, no hints: set a rough line, then press “Train my neuron” and watch it finish the job.";
    good = acc >= target && mode !== "manual";
  }
  if (!text) return null;
  return (
    <p className={`mt-2.5 flex items-start gap-1.5 text-center text-[11.5px] leading-relaxed ${good ? "text-ok" : "text-txt3"}`}>
      {good && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1">{text}</span>
    </p>
  );
}
