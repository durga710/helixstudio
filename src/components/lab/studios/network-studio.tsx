"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Network, Sparkles, Minus, Plus, RotateCcw } from "lucide-react";
import { CLASS_COLORS } from "@/components/lab/datasets";
import type { StudioProps } from "./index";
import { getStudioMeta, type StudioChallenge } from "@/lib/lessons/studios";
import { InfoTip } from "@/components/lab/info-tip";
import { StudioCoach } from "@/components/lab/studio-coach";

/* Neural Net Studio — build the brain, then train it. The two groups (a ring
 * around a core) can't be split by a straight line, so ONE neuron is stuck. The
 * student adds hidden neurons and presses Train: a real tiny MLP learns by
 * back-prop, the decision boundary bends, and accuracy climbs. They discover
 * that depth/width is what bends the line. Pure JS, trains live. */

const TARGET = 0.9;
const LR = 0.6;
const EPOCHS_PER_TICK = 18;
const MAX_ROUNDS = 900;
const W = 300;
const H = 300;
const GRID = 22;

const IN = CLASS_COLORS[1]; // Core (teal)
const OUT = CLASS_COLORS[0]; // Ring (red)

interface Sample {
  x: [number, number];
  y: number; // 1 = Core, 0 = Ring
}

// A core surrounded by a ring — not linearly separable (normalized to ~[-1,1]).
const DATA: Sample[] = [
  ...[
    [0, 0], [0.2, 0.15], [-0.2, 0.1], [0.1, -0.2], [-0.15, -0.18],
    [0.25, -0.05], [-0.05, 0.25], [0.05, -0.28], [0.3, 0.2], [-0.28, -0.1],
  ].map(([a, b]) => ({ x: [a, b] as [number, number], y: 1 })),
  ...Array.from({ length: 12 }, (_, i) => {
    const ang = (i / 12) * Math.PI * 2;
    return { x: [0.85 * Math.cos(ang), 0.85 * Math.sin(ang)] as [number, number], y: 0 };
  }),
];

interface Net {
  W1: number[][];
  b1: number[];
  W2: number[];
  b2: number;
}

function initNet(h: number): Net {
  const r = () => (Math.random() * 2 - 1) * 0.9;
  return { W1: Array.from({ length: h }, () => [r(), r()]), b1: Array.from({ length: h }, r), W2: Array.from({ length: h }, r), b2: r() };
}

const sig = (z: number) => 1 / (1 + Math.exp(-z));

function forward(net: Net, x: [number, number]) {
  const a1 = net.W1.map((w, j) => Math.tanh(w[0] * x[0] + w[1] * x[1] + net.b1[j]));
  const out = sig(net.W2.reduce((s, w, j) => s + w * a1[j], 0) + net.b2);
  return { a1, out };
}

function trainEpochs(net: Net, data: Sample[], epochs: number): Net {
  const W1 = net.W1.map((r) => [...r]);
  const b1 = [...net.b1];
  const W2 = [...net.W2];
  let b2 = net.b2;
  const Hn = W1.length;
  const n = data.length;
  for (let e = 0; e < epochs; e++) {
    const gW1 = W1.map(() => [0, 0]);
    const gb1 = Array(Hn).fill(0);
    const gW2 = Array(Hn).fill(0);
    let gb2 = 0;
    for (const d of data) {
      const a1 = W1.map((w, j) => Math.tanh(w[0] * d.x[0] + w[1] * d.x[1] + b1[j]));
      const out = sig(W2.reduce((s, w, j) => s + w * a1[j], 0) + b2);
      const dz2 = out - d.y;
      for (let j = 0; j < Hn; j++) {
        gW2[j] += dz2 * a1[j];
        const dz1 = dz2 * W2[j] * (1 - a1[j] * a1[j]);
        gW1[j][0] += dz1 * d.x[0];
        gW1[j][1] += dz1 * d.x[1];
        gb1[j] += dz1;
      }
      gb2 += dz2;
    }
    for (let j = 0; j < Hn; j++) {
      W2[j] -= (LR * gW2[j]) / n;
      W1[j][0] -= (LR * gW1[j][0]) / n;
      W1[j][1] -= (LR * gW1[j][1]) / n;
      b1[j] -= (LR * gb1[j]) / n;
    }
    b2 -= (LR * gb2) / n;
  }
  return { W1, b1, W2, b2 };
}

function accuracyOf(net: Net): number {
  let ok = 0;
  for (const d of DATA) if ((forward(net, d.x).out > 0.5 ? 1 : 0) === d.y) ok++;
  return ok / DATA.length;
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const toSvg = (v: number) => ((v + 1.15) / 2.3) * W;

const CHALLENGES = getStudioMeta("network")?.challenges ?? [];

const LEARN_STEPS: { text: string; cta?: string }[] = [
  { text: "Start with 1 hidden neuron and press “Train”. Watch the boundary — one neuron can only draw a straight LINE." },
  { text: "A straight line can’t wrap around a ring, so it gets stuck below 90%. The fix: add more neurons. Bump “Hidden neurons” up to 3 or 4." },
  { text: "Now press “Train” again — with more neurons, their lines combine into a CURVE that bends around the core." },
  { text: "See the boundary curve around the ring? That’s why we stack neurons into a network. Train until you hit 90%.", cta: "Got it" },
];

function meetsChallenge(c: StudioChallenge, acc: number, h: number): boolean {
  if (c.minAccuracy !== undefined && acc < c.minAccuracy) return false;
  if (c.maxNeurons !== undefined && h > c.maxNeurons) return false;
  return true;
}

export function NetworkStudio({ mode = "sandbox", challengeId, onProgress, onComplete, onState }: StudioProps) {
  const challenge = useMemo(() => CHALLENGES.find((c) => c.id === challengeId), [challengeId]);
  const [h, setH] = useState(1);
  const [net, setNet] = useState<Net>(() => initNet(1));
  const [round, setRound] = useState(0);
  const [training, setTraining] = useState(false);
  const [learnStep, setLearnStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(false);

  const acc = useMemo(() => accuracyOf(net), [net]);
  const goalMet = mode === "challenge" && challenge ? meetsChallenge(challenge, acc, h) : acc >= TARGET;

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setTraining(false);
  };

  useEffect(() => {
    const pct = Math.round(acc * 100);
    let narration: string;
    if (round === 0) {
      narration = "Press Train to teach the network. With 1 neuron it can only draw a straight line — and a line can't separate a ring from its core.";
    } else {
      narration = `${h} hidden neuron${h === 1 ? "" : "s"}, ${round} rounds in. Accuracy is ${pct}%.`;
      if (h === 1 && acc < TARGET) narration += " One neuron draws only a straight line, so it's stuck — add more hidden neurons to bend the boundary.";
      else if (acc >= TARGET) narration += " The boundary curved around the ring — you built a working network. 🎉";
      else narration += " Getting there — keep training, or add a neuron to bend the boundary more.";
      if (mode === "challenge" && challenge?.minAccuracy !== undefined) narration += ` Mission: 90% with as few neurons as you can — you're using ${h}.`;
    }
    onProgress?.((acc / TARGET) * 100);
    onState?.({ neurons: h, rounds: round, accuracy: pct, training, narration });
    if (goalMet && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc, round, h, training, mode, challengeId]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  function setNeurons(n: number) {
    stop();
    const clamped = Math.max(1, Math.min(6, n));
    setH(clamped);
    setNet(initNet(clamped));
    setRound(0);
    done.current = false;
    if (mode === "learn" && learnStep === 1 && clamped > 1) setLearnStep(2);
  }

  function train() {
    if (timer.current) return;
    done.current = false;
    setTraining(true);
    if (mode === "learn") {
      if (learnStep === 0) setLearnStep(1);
      else if (learnStep === 2 && h > 1) setLearnStep(3);
    }
    let working = net;
    let r = round;
    timer.current = setInterval(() => {
      working = trainEpochs(working, DATA, EPOCHS_PER_TICK);
      r += EPOCHS_PER_TICK;
      setNet(working);
      setRound(r);
      // Self-terminate once it's learned the shape (or we hit the cap).
      if (accuracyOf(working) >= TARGET || r >= MAX_ROUNDS) stop();
    }, 60);
  }

  function resetWeights() {
    stop();
    setNet(initNet(h));
    setRound(0);
    done.current = false;
  }

  // Decision-boundary heatmap (sampled grid → blended fill).
  const cells = useMemo(() => {
    const out: { x: number; y: number; s: number; fill: string }[] = [];
    const step = 2.3 / GRID;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x = -1.15 + step * (i + 0.5);
        const y = -1.15 + step * (j + 0.5);
        const p = forward(net, [x, y]).out;
        out.push({ x: (i / GRID) * W, y: H - ((j + 1) / GRID) * H, s: W / GRID + 1, fill: hexLerp(OUT, IN, p) });
      }
    }
    return out;
  }, [net]);

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {mode === "learn" && (
        <StudioCoach
          index={learnStep}
          total={LEARN_STEPS.length}
          done={learnStep >= LEARN_STEPS.length}
          text={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].text : "You’ve built a real network — train it to 90% around the ring, or try Challenge mode up top."}
          cta={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].cta : undefined}
          onNext={learnStep < LEARN_STEPS.length && LEARN_STEPS[learnStep].cta ? () => setLearnStep((s) => s + 1) : undefined}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
          <Network className="h-4 w-4 text-accent" /> Your network
        </span>
        <span className="inline-flex items-center gap-1 text-txt3">
          Accuracy: <b className="text-txt" style={{ color: acc >= TARGET ? "var(--ok)" : undefined }}>{Math.round(acc * 100)}%</b>
          <span className="text-txt3"> · goal {Math.round(TARGET * 100)}%</span>
          <InfoTip text="The share of dots on the right side of the boundary. 90% means the curve wrapped around the ring." />
        </span>
        <span className="text-txt3">{h} hidden neuron{h === 1 ? "" : "s"} · {round} rounds</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        {/* boundary + data */}
        <div className="overflow-hidden rounded-md border border-border2 bg-panel">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {cells.map((c, i) => (
              <rect key={i} x={c.x} y={c.y} width={c.s} height={c.s} fill={c.fill} opacity={0.55} />
            ))}
            {DATA.map((d, i) => (
              <circle key={i} cx={toSvg(d.x[0])} cy={H - toSvg(d.x[1])} r={4.5} fill={d.y === 1 ? IN : OUT} stroke="#0d1626" strokeWidth={1} />
            ))}
          </svg>
        </div>

        {/* network diagram */}
        <div className="grid place-items-center rounded-md border border-border2 bg-panel px-2 py-3">
          <svg viewBox="0 0 120 200" className="h-[150px]">
            {[0, 1].map((iy) => {
              const y1 = 70 + iy * 60;
              return net.W1.map((_, j) => {
                const y2 = 100 - ((h - 1) * 26) / 2 + j * 26;
                return <line key={`i${iy}-${j}`} x1={20} y1={y1} x2={60} y2={y2} stroke="#2a3a55" strokeWidth={0.8} />;
              });
            })}
            {net.W1.map((_, j) => {
              const y2 = 100 - ((h - 1) * 26) / 2 + j * 26;
              return <line key={`o${j}`} x1={60} y1={y2} x2={100} y2={100} stroke="#2a3a55" strokeWidth={0.8} />;
            })}
            {[0, 1].map((iy) => (
              <circle key={iy} cx={20} cy={70 + iy * 60} r={7} fill="#0d1626" stroke="#7d8ba3" strokeWidth={1.2} />
            ))}
            {net.W1.map((_, j) => (
              <circle key={j} cx={60} cy={100 - ((h - 1) * 26) / 2 + j * 26} r={7} fill="#0d1626" stroke="var(--accent)" strokeWidth={1.4} />
            ))}
            <circle cx={100} cy={100} r={7} fill="#0d1626" stroke="#c084fc" strokeWidth={1.4} />
          </svg>
          <div className="mt-1 text-center text-[10px] text-txt3">inputs · hidden · answer</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-txt2">
          Hidden neurons
          <InfoTip text="The neurons in the middle. One alone can only draw a straight line; more of them = a bendier boundary." />
        </span>
        <div className="inline-flex items-center overflow-hidden rounded-md border border-border2">
          <button onClick={() => setNeurons(h - 1)} disabled={h <= 1} className="px-2 py-1 text-txt2 transition-colors hover:text-txt disabled:opacity-40">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-7 text-center text-[12.5px] font-semibold text-txt">{h}</span>
          <button onClick={() => setNeurons(h + 1)} disabled={h >= 6} className="px-2 py-1 text-txt2 transition-colors hover:text-txt disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          onClick={resetWeights}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <RotateCcw className="h-3.5 w-3.5" /> New weights
        </button>
        <button
          onClick={train}
          disabled={training}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" /> {training ? "Training…" : "Train"}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-txt3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: IN }} /> core</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: OUT }} /> ring</span>
        <span className="text-txt3">the colored regions are the network&apos;s decision boundary</span>
      </div>
    </div>
  );
}
