"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Sparkles, Shuffle, Lock } from "lucide-react";
import { CLASS_COLORS } from "@/components/lab/datasets";
import type { StudioProps } from "./index";
import { InfoTip } from "@/components/lab/info-tip";
import { StudioCoach } from "@/components/lab/studio-coach";

/* Clustering Studio — find the hidden groups, by HAND. The dots have no labels;
 * the student drags the group centers (✕) onto the clumps and drops in their own
 * dots, watching dots recolor to their nearest center live and each group "lock
 * in" with a glow when it's tight. Or press Auto-settle to let K-Means finish it.
 * Distinct interactive elements: drag-the-centers, drop-your-own-dots, live
 * group-locked-in feedback. Pure JS, all live. */

const W = 360;
const H = 260;
const PAD = 24;
const GOOD = 90; // a group is "tight" when its average squared spread is under this

interface P {
  x: number;
  y: number;
}

// Three natural blobs (labels intentionally unused — clustering is unsupervised).
const BASE: P[] = [
  { x: 14, y: 20 }, { x: 18, y: 16 }, { x: 11, y: 24 }, { x: 20, y: 22 }, { x: 16, y: 27 }, { x: 22, y: 18 }, { x: 13, y: 17 },
  { x: 78, y: 74 }, { x: 82, y: 80 }, { x: 74, y: 78 }, { x: 85, y: 72 }, { x: 80, y: 85 }, { x: 76, y: 70 }, { x: 88, y: 79 },
  { x: 80, y: 18 }, { x: 85, y: 24 }, { x: 76, y: 14 }, { x: 88, y: 20 }, { x: 82, y: 28 }, { x: 79, y: 22 }, { x: 90, y: 16 },
];

const dist2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

/** Centroids start BUNCHED in the middle, so the student has to drag them out. */
function seed(k: number): P[] {
  return Array.from({ length: k }, (_, i) => ({ x: 46 + (i - (k - 1) / 2) * 7 + (Math.random() * 6 - 3), y: 50 + (Math.random() * 6 - 3) }));
}

const LEARN_STEPS: { text: string; cta?: string }[] = [
  { text: "These dots have no labels — you find the groups yourself. Grab a ✕ (a group center) and DRAG it onto a clump of dots." },
  { text: "See the dots near it turn its color? They joined that group. Drag the other ✕’s onto the other clumps too.", cta: "Got it" },
  { text: "A group glows and 🔒 locks when it's tight. Get all 3 groups locked to win — or press “Auto-settle” to let the computer finish.", cta: "Got it" },
];

export function ClusterStudio({ onProgress, onComplete, onState }: StudioProps) {
  const [k, setK] = useState(3);
  const [points, setPoints] = useState<P[]>(() => [...BASE]);
  const [centroids, setCentroids] = useState<P[]>(() => seed(3));
  const [learnStep, setLearnStep] = useState(0);
  const [settling, setSettling] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(false);

  const labels = useMemo(() => assign(points, centroids), [points, centroids]);
  const groupStats = useMemo(
    () =>
      centroids.map((c, i) => {
        const members = points.filter((_, idx) => labels[idx] === i);
        if (members.length === 0) return { perPoint: Infinity, tight: false, count: 0 };
        const gi = members.reduce((s, p) => s + dist2(p, c), 0);
        return { perPoint: gi / members.length, tight: gi / members.length <= GOOD, count: members.length };
      }),
    [points, centroids, labels],
  );
  const tightCount = groupStats.filter((g) => g.tight && g.count > 0).length;
  const goalMet = k === 3 && tightCount === 3;

  const sx = (x: number) => PAD + (x / 100) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / 100) * (H - PAD * 2);

  useEffect(() => {
    let narration: string;
    if (tightCount === 0) {
      narration = "These dots have no labels. Drag a ✕ (group center) onto a clump — the nearby dots will turn its color and join that group.";
    } else {
      narration = `${tightCount} of ${k} group${k === 1 ? "" : "s"} ${tightCount === 1 ? "is" : "are"} locked in (tight).`;
      if (k !== 3) narration += ` You set ${k} groups, but there are really 3 hidden here — try 3.`;
      else if (tightCount === 3) narration += " You found all 3 hidden groups — nice!";
      else narration += " Drag the other centers onto the remaining clumps.";
    }
    onProgress?.(Math.round((tightCount / Math.max(3, k)) * 100));
    onState?.({ k, tightGroups: tightCount, narration });
    if (goalMet && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tightCount, k]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  function clientToData(clientX: number, clientY: number): P {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const px = ((clientX - rect.left) / rect.width) * W;
    const py = ((clientY - rect.top) / rect.height) * H;
    return {
      x: clamp(((px - PAD) / (W - PAD * 2)) * 100, 0, 100),
      y: clamp(((H - PAD - py) / (H - PAD * 2)) * 100, 0, 100),
    };
  }

  // --- drag a group center ---
  function onCenterDown(i: number, e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = i;
    if (learnStep === 0) setLearnStep(1);
  }
  function onCenterMove(e: React.PointerEvent) {
    if (dragRef.current === null) return;
    const pos = clientToData(e.clientX, e.clientY);
    setCentroids((prev) => prev.map((c, i) => (i === dragRef.current ? pos : c)));
  }
  function onCenterUp() {
    dragRef.current = null;
  }

  // --- drop a dot on empty space ---
  function onSvgDown(e: React.PointerEvent) {
    if (points.length >= 45) return;
    setPoints((prev) => [...prev, clientToData(e.clientX, e.clientY)]);
  }

  function autoSettle() {
    if (timer.current) return;
    if (learnStep === 0) setLearnStep(1);
    setSettling(true);
    let n = 0;
    timer.current = setInterval(() => {
      let stop = false;
      setCentroids((prev) => {
        const nextC = move(points, assign(points, prev), k, prev);
        if (nextC.every((c, i) => Math.abs(c.x - prev[i].x) < 0.1 && Math.abs(c.y - prev[i].y) < 0.1)) stop = true;
        return nextC;
      });
      if (++n >= 14 || stop) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setSettling(false);
      }
    }, 320);
  }

  function reset(nextK = k) {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setSettling(false);
    setK(nextK);
    setPoints([...BASE]);
    setCentroids(seed(nextK));
    done.current = false;
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <StudioCoach
        index={learnStep}
        total={LEARN_STEPS.length}
        done={learnStep >= LEARN_STEPS.length}
        text={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].text : "You’ve got it — lock in all 3 groups by dragging the centers onto the clumps!"}
        cta={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].cta : undefined}
        onNext={learnStep < LEARN_STEPS.length && LEARN_STEPS[learnStep].cta ? () => setLearnStep((s) => s + 1) : undefined}
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
          <Boxes className="h-4 w-4 text-accent" /> Your groups
        </span>
        <span className="inline-flex items-center gap-1 text-txt3">
          Locked in: <b className="text-txt" style={{ color: tightCount === 3 ? "var(--ok)" : undefined }}>{tightCount}</b> of {k}
          <InfoTip text="A group locks in when its dots are all sitting close to its center. Get all 3 tight to win." />
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border2 bg-panel">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair touch-none select-none"
          onPointerDown={onSvgDown}
          onPointerMove={onCenterMove}
          onPointerUp={onCenterUp}
        >
          {/* dots — colored by their nearest center */}
          {points.map((p, i) => {
            const g = labels[i];
            return <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={CLASS_COLORS[g % CLASS_COLORS.length]} fillOpacity={groupStats[g]?.tight ? 0.95 : 0.7} />;
          })}
          {/* group centers — draggable; glow + lock when tight */}
          {centroids.map((c, i) => {
            const col = CLASS_COLORS[i % CLASS_COLORS.length];
            const tight = groupStats[i]?.tight && groupStats[i]?.count > 0;
            return (
              <g key={i} className="cursor-grab" onPointerDown={(e) => onCenterDown(i, e)} onPointerMove={onCenterMove} onPointerUp={onCenterUp}>
                {tight && <circle cx={sx(c.x)} cy={sy(c.y)} r={15} fill="none" stroke={col} strokeWidth={2} className="animate-pulse" />}
                {/* easy-grab hit area */}
                <circle cx={sx(c.x)} cy={sy(c.y)} r={14} fill="transparent" />
                <line x1={sx(c.x) - 7} y1={sy(c.y) - 7} x2={sx(c.x) + 7} y2={sy(c.y) + 7} stroke={col} strokeWidth={3.5} strokeLinecap="round" />
                <line x1={sx(c.x) - 7} y1={sy(c.y) + 7} x2={sx(c.x) + 7} y2={sy(c.y) - 7} stroke={col} strokeWidth={3.5} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-1.5 text-center text-[11px] text-txt3">
        <b className="text-txt2">Drag a ✕</b> onto a clump · <b className="text-txt2">tap empty space</b> to add your own dot
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-txt2">
          Groups (K)
          <InfoTip text="K is how many groups you're looking for. There are 3 hidden here — try 2 or 4 to see what goes wrong." />
        </span>
        <div className="inline-flex overflow-hidden rounded-md border border-border2">
          {[2, 3, 4].map((kk) => (
            <button
              key={kk}
              onClick={() => reset(kk)}
              className={`px-2.5 py-1 text-[12px] transition-colors ${k === kk ? "bg-accent text-accent-ink" : "bg-panel text-txt3 hover:text-txt"}`}
            >
              {kk}
            </button>
          ))}
        </div>
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <Shuffle className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          onClick={autoSettle}
          disabled={settling}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {settling ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} {settling ? "Settling…" : "Auto-settle"}
        </button>
      </div>
    </div>
  );
}
