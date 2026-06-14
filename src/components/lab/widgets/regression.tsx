"use client";

import { useCallback, useRef, useState } from "react";
import { RotateCcw, Wand2 } from "lucide-react";
import type { WidgetProps } from "./index";

/* RegressionPlayground — drag the dots, press "Fit the line," and the computer
 * finds the straight line that best predicts Y from X (least squares). Residual
 * lines show each miss; the error number shrinks as the fit improves. */

const W = 340;
const H = 260;
const PAD = 30;
const DMAX = 10; // data range 0..10 on both axes

interface P {
  x: number;
  y: number;
}

const DEFAULT: P[] = [
  { x: 1, y: 2 },
  { x: 2, y: 2.6 },
  { x: 3.2, y: 3.4 },
  { x: 4.5, y: 4.2 },
  { x: 6, y: 5.6 },
  { x: 7.5, y: 6.1 },
  { x: 9, y: 7.8 },
];

export function RegressionPlayground({ onComplete }: WidgetProps) {
  const [points, setPoints] = useState<P[]>(() => DEFAULT.map((p) => ({ ...p })));
  const [fitted, setFitted] = useState(false);
  const drag = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const sx = (x: number) => PAD + (x / DMAX) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / DMAX) * (H - PAD * 2);

  // Least-squares line y = m*x + b.
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  const m = den === 0 ? 0 : num / den;
  const b = my - m * mx;
  const predict = (x: number) => m * x + b;
  const sse = points.reduce((s, p) => s + (p.y - predict(p.x)) ** 2, 0);

  const toData = useCallback((clientX: number, clientY: number): P => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    const vy = ((clientY - rect.top) / rect.height) * H;
    const x = ((vx - PAD) / (W - PAD * 2)) * DMAX;
    const y = ((H - PAD - vy) / (H - PAD * 2)) * DMAX;
    return { x: Math.max(0, Math.min(DMAX, x)), y: Math.max(0, Math.min(DMAX, y)) };
  }, []);

  function onMove(e: React.PointerEvent) {
    if (drag.current === null) return;
    const d = toData(e.clientX, e.clientY);
    setPoints((prev) => prev.map((p, i) => (i === drag.current ? d : p)));
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#7d8ba3" fontSize={10}>
          input (x)
        </text>
        <text x={10} y={H / 2} textAnchor="middle" fill="#7d8ba3" fontSize={10} transform={`rotate(-90 10 ${H / 2})`}>
          output (y)
        </text>

        {/* the fitted line + residuals */}
        {fitted && (
          <>
            <line x1={sx(0)} y1={sy(predict(0))} x2={sx(DMAX)} y2={sy(predict(DMAX))} stroke="#00e0c0" strokeWidth={2} />
            {points.map((p, i) => (
              <line key={`r${i}`} x1={sx(p.x)} y1={sy(p.y)} x2={sx(p.x)} y2={sy(predict(p.x))} stroke="#ffb000" strokeWidth={1} strokeDasharray="2 2" />
            ))}
          </>
        )}

        {/* draggable points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={6}
            fill="#ff004d"
            className="cursor-grab"
            onPointerDown={(e) => {
              drag.current = i;
              (e.target as Element).setPointerCapture?.(e.pointerId);
            }}
          />
        ))}
      </svg>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => {
            setPoints(DEFAULT.map((p) => ({ ...p })));
            setFitted(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        {fitted ? (
          <span className="ml-auto text-[12.5px] text-txt2">
            Error: <span className="font-semibold text-txt">{sse.toFixed(1)}</span>{" "}
            <span className="text-txt3">(smaller = better fit)</span>
          </span>
        ) : (
          <button
            onClick={() => {
              setFitted(true);
              onComplete();
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition hover:brightness-110"
          >
            <Wand2 className="h-3.5 w-3.5" /> Fit the line
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11.5px] text-txt3">
        Drag the red dots — the line and the error update live.
      </p>
    </div>
  );
}
