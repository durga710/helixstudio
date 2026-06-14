"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Play, StepForward, Shuffle } from "lucide-react";
import { CLASS_COLORS } from "@/components/lab/datasets";
import type { StudioProps } from "./index";
import { getStudioMeta, type StudioChallenge } from "@/lib/lessons/studios";
import { InfoTip } from "@/components/lab/info-tip";
import { StudioCoach } from "@/components/lab/studio-coach";

/* K-Means Studio — find the hidden groups. The student sets K, drops centroids,
 * and runs the loop (assign → move) step by step, watching dots snap into
 * clusters and the "spread" shrink. Building = choosing K + iterating. Pure JS. */

const W = 360;
const H = 260;
const PAD = 24;
const TARGET_INERTIA = 130; // a well-converged 3-cluster solution lands under this

interface P {
  x: number;
  y: number;
}

// Three natural blobs (labels intentionally unused — clustering is unsupervised).
const POINTS: P[] = [
  // blob 1 (low-left)
  { x: 14, y: 20 }, { x: 18, y: 16 }, { x: 11, y: 24 }, { x: 20, y: 22 }, { x: 16, y: 27 }, { x: 22, y: 18 }, { x: 13, y: 17 },
  // blob 2 (top-right)
  { x: 78, y: 74 }, { x: 82, y: 80 }, { x: 74, y: 78 }, { x: 85, y: 72 }, { x: 80, y: 85 }, { x: 76, y: 70 }, { x: 88, y: 79 },
  // blob 3 (low-right)
  { x: 80, y: 18 }, { x: 85, y: 24 }, { x: 76, y: 14 }, { x: 88, y: 20 }, { x: 82, y: 28 }, { x: 79, y: 22 }, { x: 90, y: 16 },
];

const dist2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function assign(points: P[], centroids: P[]): number[] {
  return points.map((p) => {
    let best = 0;
    let bd = Infinity;
    centroids.forEach((c, i) => {
      const d = dist2(p, c);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  });
}

function move(points: P[], labels: number[], k: number, prev: P[]): P[] {
  const next: P[] = [];
  for (let i = 0; i < k; i++) {
    const members = points.filter((_, idx) => labels[idx] === i);
    if (members.length === 0) {
      next.push(prev[i]);
      continue;
    }
    next.push({
      x: members.reduce((s, p) => s + p.x, 0) / members.length,
      y: members.reduce((s, p) => s + p.y, 0) / members.length,
    });
  }
  return next;
}

function inertia(points: P[], labels: number[], centroids: P[]): number {
  let s = 0;
  points.forEach((p, i) => (s += dist2(p, centroids[labels[i]])));
  return s;
}

function seed(k: number): P[] {
  // Spread initial centroids around the cloud with a little jitter.
  return Array.from({ length: k }, () => {
    const p = POINTS[Math.floor(Math.random() * POINTS.length)];
    return { x: p.x + (Math.random() * 16 - 8), y: p.y + (Math.random() * 16 - 8) };
  });
}

const CHALLENGES = getStudioMeta("cluster")?.challenges ?? [];

const LEARN_STEPS: { text: string; cta?: string }[] = [
  { text: "These dots have no labels — the computer finds the groups itself. The ✕ marks are group centers, dropped randomly. Press “Step” once." },
  { text: "The dots changed color — each one joined its nearest ✕, and the ✕’s hopped to the middle of their dots. “Spread” is how far dots sit from their center; lower = tighter.", cta: "Got it" },
  { text: "Keep pressing “Step”, or press “Run” to finish, until the 3 groups lock in (Spread under 130). Then come back.", cta: "Got it" },
  { text: "You uncovered the hidden groups! Now try “Groups (K)” = 2 or 4 to see why picking the right number matters.", cta: "Got it" },
];

function meetsChallenge(c: StudioChallenge, k: number, iters: number, score: number): boolean {
  const base = k === 3 && iters >= 2 && score <= TARGET_INERTIA;
  if (!base) return false;
  if (c.maxRounds !== undefined && iters > c.maxRounds) return false;
  return true;
}

export function ClusterStudio({ mode = "sandbox", challengeId, onProgress, onComplete, onState }: StudioProps) {
  const challenge = useMemo(() => CHALLENGES.find((c) => c.id === challengeId), [challengeId]);
  const [k, setK] = useState(3);
  const [centroids, setCentroids] = useState<P[]>(() => seed(3));
  const [iters, setIters] = useState(0);
  const [learnStep, setLearnStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(false);

  const labels = useMemo(() => assign(POINTS, centroids), [centroids]);
  const score = useMemo(() => Math.round(inertia(POINTS, labels, centroids)), [labels, centroids]);
  const goalMet = mode === "challenge" && challenge ? meetsChallenge(challenge, k, iters, score) : k === 3 && iters >= 2 && score <= TARGET_INERTIA;

  const sx = (x: number) => PAD + (x / 100) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / 100) * (H - PAD * 2);

  useEffect(() => {
    let narration: string;
    if (iters === 0) {
      narration = "These dots have no labels. The ✕ marks are guesses at where the groups are. Press Step or Run to start sorting the dots into groups.";
    } else {
      narration = `${k} group${k === 1 ? "" : "s"}, ${iters} round${iters === 1 ? "" : "s"} in. Spread is ${score} (lower = tighter groups).`;
      if (k !== 3) narration += ` You're looking for ${k}, but there are really 3 hidden here — try K=3.`;
      else if (score <= TARGET_INERTIA) narration += " The 3 groups locked in — you found them.";
      else narration += " Keep stepping; the spread is still shrinking.";
      if (mode === "challenge" && challenge?.maxRounds !== undefined) narration += ` Mission: find them in ${challenge.maxRounds} rounds or fewer — you're at ${iters}.`;
    }
    const start = 4000;
    onProgress?.(iters === 0 ? 0 : Math.min(100, ((start - score) / (start - TARGET_INERTIA)) * 100));
    onState?.({ k, iterations: iters, spread: score, narration });
    if (goalMet && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, iters, k, mode, challengeId]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  function step() {
    setCentroids((prev) => move(POINTS, assign(POINTS, prev), k, prev));
    setIters((n) => n + 1);
    if (mode === "learn" && learnStep === 0) setLearnStep(1);
  }

  function run() {
    if (timer.current) return;
    if (mode === "learn" && learnStep === 0) setLearnStep(1);
    let n = 0;
    timer.current = setInterval(() => {
      let stop = false;
      setCentroids((prev) => {
        const nextC = move(POINTS, assign(POINTS, prev), k, prev);
        if (nextC.every((c, i) => Math.abs(c.x - prev[i].x) < 0.05 && Math.abs(c.y - prev[i].y) < 0.05)) stop = true;
        return nextC;
      });
      setIters((m) => m + 1);
      if (++n >= 12 || stop) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      }
    }, 380);
  }

  function reseed(nextK = k) {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setK(nextK);
    setCentroids(seed(nextK));
    setIters(0);
    done.current = false;
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      {mode === "learn" && (
        <StudioCoach
          index={learnStep}
          total={LEARN_STEPS.length}
          done={learnStep >= LEARN_STEPS.length}
          text={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].text : "You’ve got K-Means down — uncover the 3 groups, or try Challenge mode up top."}
          cta={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].cta : undefined}
          onNext={learnStep < LEARN_STEPS.length && LEARN_STEPS[learnStep].cta ? () => setLearnStep((s) => s + 1) : undefined}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
          <Boxes className="h-4 w-4 text-accent" /> Your clusters
        </span>
        <span className="inline-flex items-center gap-1 text-txt3">
          Spread: <b className="text-txt" style={{ color: k === 3 && score <= TARGET_INERTIA ? "var(--ok)" : undefined }}>{score}</b>
          <span className="text-txt3"> · lower is tighter</span>
          <InfoTip text="Spread is how far the dots sit from their group's center, added up. Tighter groups = a smaller number." />
        </span>
        <span className="text-txt3">Rounds: <b className="text-txt2">{iters}</b></span>
      </div>

      <div className="overflow-hidden rounded-md border border-border2 bg-panel">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {POINTS.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={CLASS_COLORS[labels[i] % CLASS_COLORS.length]} fillOpacity={0.85} />
          ))}
          {centroids.map((c, i) => (
            <g key={i}>
              <line x1={sx(c.x) - 7} y1={sy(c.y) - 7} x2={sx(c.x) + 7} y2={sy(c.y) + 7} stroke={CLASS_COLORS[i % CLASS_COLORS.length]} strokeWidth={3} />
              <line x1={sx(c.x) - 7} y1={sy(c.y) + 7} x2={sx(c.x) + 7} y2={sy(c.y) - 7} stroke={CLASS_COLORS[i % CLASS_COLORS.length]} strokeWidth={3} />
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-txt2">
          Groups (K)
          <InfoTip text="K is how many groups you tell it to look for. There are 3 hidden here — try 2 or 4 to see what goes wrong." />
        </span>
        <div className="inline-flex overflow-hidden rounded-md border border-border2">
          {[2, 3, 4].map((kk) => (
            <button
              key={kk}
              onClick={() => reseed(kk)}
              className={`px-2.5 py-1 text-[12px] transition-colors ${k === kk ? "bg-accent text-accent-ink" : "bg-panel text-txt3 hover:text-txt"}`}
            >
              {kk}
            </button>
          ))}
        </div>
        <button
          onClick={() => reseed()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <Shuffle className="h-3.5 w-3.5" /> New seeds
        </button>
        <button
          onClick={step}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <StepForward className="h-3.5 w-3.5" /> Step
        </button>
        <button
          onClick={run}
          className="inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110"
        >
          <Play className="h-3.5 w-3.5" /> Run
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-txt3">
        Each round: every dot joins its nearest <b className="text-txt2">×</b>, then each × hops to the middle of its dots. Find the 3 hidden groups.
      </p>
    </div>
  );
}
