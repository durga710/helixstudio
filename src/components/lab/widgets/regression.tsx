"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Wand2 } from "lucide-react";
import type { WidgetProps } from "./index";

/* RegressionPlayground — "Build a predictor." The student drags the two ends of
 * a line to lay it through the data themselves; the error (how far off it is)
 * updates live as they tune it. "Best fit" snaps to the mathematically perfect
 * line so they can compare. Goal: get the error under the target by hand. */

const W = 340;
const H = 260;
const PAD = 30;
const DMAX = 10;
const GOAL = 0.6; // target error (RMSE)

interface P {
  x: number;
  y: number;
}

// Fixed data with a clear upward trend + a little noise (best-fit error ≈ 0.25).
const DATA: P[] = [
  { x: 1, y: 1.9 }, { x: 2, y: 2.3 }, { x: 3, y: 3.0 }, { x: 4, y: 3.2 }, { x: 5, y: 4.1 },
  { x: 6, y: 4.4 }, { x: 7, y: 5.2 }, { x: 8, y: 5.6 }, { x: 9, y: 6.4 },
];

export function RegressionPlayground({ onComplete, onState }: WidgetProps) {
  // The line is two endpoints the student drags: y at x=0 and y at x=DMAX.
  const [y0, setY0] = useState(5);
  const [y1, setY1] = useState(5);
  const [touched, setTouched] = useState(false);
  const drag = useRef<"y0" | "y1" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const done = useRef(false);

  const sx = (x: number) => PAD + (x / DMAX) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / DMAX) * (H - PAD * 2);
  const predict = (x: number) => y0 + ((y1 - y0) / DMAX) * x;
  const rmse = Math.sqrt(DATA.reduce((s, p) => s + (p.y - predict(p.x)) ** 2, 0) / DATA.length);

  useEffect(() => {
    onState?.({ error: Math.round(rmse * 100) / 100, tuned: touched });
    if (touched && rmse <= GOAL && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rmse, touched]);

  const toY = useCallback((clientY: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vy = ((clientY - rect.top) / rect.height) * H;
    const y = ((H - PAD - vy) / (H - PAD * 2)) * DMAX;
    return Math.max(0, Math.min(DMAX, y));
  }, []);

  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const y = toY(e.clientY);
    if (drag.current === "y0") setY0(y);
    else setY1(y);
    if (!touched) setTouched(true);
  }

  function bestFit() {
    const n = DATA.length;
    const mx = DATA.reduce((s, p) => s + p.x, 0) / n;
    const my = DATA.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of DATA) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) * (p.x - mx);
    }
    const m = den === 0 ? 0 : num / den;
    const b = my - m * mx;
    setY0(b);
    setY1(b + m * DMAX);
    setTouched(true);
  }

  function reset() {
    setY0(5);
    setY1(5);
    setTouched(false);
    done.current = false;
  }

  const good = touched && rmse <= GOAL;

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-2 flex items-center gap-2 text-[12px]">
        <span className="text-txt3">
          Error: <b className="text-txt" style={{ color: good ? "var(--ok)" : undefined }}>{rmse.toFixed(2)}</b>
          <span className="text-txt3"> · goal under {GOAL} (smaller = closer)</span>
        </span>
        {good && <span className="text-[11.5px] font-semibold text-ok">nice fit! ✓</span>}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-md border border-border2 bg-panel"
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#7d8ba3" fontSize={10}>input (x)</text>
        <text x={10} y={H / 2} textAnchor="middle" fill="#7d8ba3" fontSize={10} transform={`rotate(-90 10 ${H / 2})`}>output (y)</text>

        {/* residuals (how far each point is from your line) */}
        {DATA.map((p, i) => (
          <line key={`r${i}`} x1={sx(p.x)} y1={sy(p.y)} x2={sx(p.x)} y2={sy(predict(p.x))} stroke="#ffb000" strokeWidth={1} strokeDasharray="2 2" />
        ))}

        {/* the student's line */}
        <line x1={sx(0)} y1={sy(y0)} x2={sx(DMAX)} y2={sy(y1)} stroke="#00e0c0" strokeWidth={2.5} />

        {/* data */}
        {DATA.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill="#ff004d" />
        ))}

        {/* draggable line ends */}
        {(["y0", "y1"] as const).map((h) => {
          const x = h === "y0" ? 0 : DMAX;
          const y = h === "y0" ? y0 : y1;
          return (
            <circle
              key={h}
              cx={sx(x)}
              cy={sy(y)}
              r={8}
              fill="#00e0c0"
              fillOpacity={0.25}
              stroke="#00e0c0"
              strokeWidth={2}
              className="cursor-grab"
              onPointerDown={(e) => {
                drag.current = h;
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
          );
        })}
      </svg>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          onClick={bestFit}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition hover:brightness-110"
        >
          <Wand2 className="h-3.5 w-3.5" /> Snap to best fit
        </button>
      </div>
      <p className="mt-2 text-center text-[11.5px] text-txt3">
        Drag the two ring handles to lay the line through the dots — get the error under {GOAL}. Stuck? Snap to the perfect fit.
      </p>
    </div>
  );
}
