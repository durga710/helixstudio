"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Sparkles } from "lucide-react";
import type { StudioProps } from "./index";

/* Regression Studio — build a predictor. The student dials up model complexity
 * (a straight line → a bendy curve) and fits it to the dots, watching the error
 * on held-out points. Too simple underfits; too complex overfits — they find the
 * sweet spot themselves. Pure-math least-squares polynomial fit. */

const TARGET_RMSE = 0.5; // goal: error on new points
const W = 360;
const H = 240;
const PAD = 34;

// A gentle hump: a line can't follow it (underfit), degree 2–3 nails it, degree 4
// wiggles on the noise (overfit). Every 3rd point is held out as a test point.
const DATA: { x: number; y: number }[] = [
  { x: 0, y: 1.05 }, { x: 0.7, y: 1.5 }, { x: 1.5, y: 2.3 }, { x: 2.2, y: 2.55 },
  { x: 3, y: 3.15 }, { x: 3.8, y: 3.3 }, { x: 4.5, y: 3.7 }, { x: 5.3, y: 3.72 },
  { x: 6, y: 3.95 }, { x: 6.8, y: 3.8 }, { x: 7.5, y: 3.9 }, { x: 8.2, y: 3.55 },
  { x: 9, y: 3.5 }, { x: 9.7, y: 3.05 },
];
const TRAIN = DATA.filter((_, i) => i % 3 !== 2);
const TEST = DATA.filter((_, i) => i % 3 === 2);
const XS = DATA.map((d) => d.x);
const YS = DATA.map((d) => d.y);
const X_MIN = Math.min(...XS);
const X_MAX = Math.max(...XS);
const Y_MIN = Math.min(...YS) - 0.4;
const Y_MAX = Math.max(...YS) + 0.4;

// Normalize x into [-1,1] so high-degree normal equations stay numerically sane.
const norm = (x: number) => (2 * (x - X_MIN)) / (X_MAX - X_MIN) - 1;

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

function fitPoly(points: { x: number; y: number }[], degree: number): number[] {
  const m = degree + 1;
  const A = Array.from({ length: m }, () => Array(m).fill(0));
  const b = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (const p of points) s += Math.pow(norm(p.x), i + j);
      A[i][j] = s;
    }
    let sb = 0;
    for (const p of points) sb += p.y * Math.pow(norm(p.x), i);
    b[i] = sb;
  }
  return solve(A, b);
}

const evalPoly = (c: number[], x: number) => c.reduce((s, ck, k) => s + ck * Math.pow(norm(x), k), 0);

function rmse(c: number[], points: { x: number; y: number }[]): number {
  if (points.length === 0) return 0;
  let s = 0;
  for (const p of points) s += (evalPoly(c, p.x) - p.y) ** 2;
  return Math.sqrt(s / points.length);
}

const DEGREE_LABEL: Record<number, string> = { 1: "straight line", 2: "gentle curve", 3: "bendy curve", 4: "very bendy" };

export function RegressionStudio({ onProgress, onComplete, onState }: StudioProps) {
  const [degree, setDegree] = useState(1);
  const [coeffs, setCoeffs] = useState<number[] | null>(null);
  const [fittedDegree, setFittedDegree] = useState(1);
  const done = useRef(false);

  const sx = (x: number) => PAD + ((x - X_MIN) / (X_MAX - X_MIN || 1)) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - ((y - Y_MIN) / (Y_MAX - Y_MIN || 1)) * (H - PAD * 2);

  const trainRMSE = useMemo(() => (coeffs ? rmse(coeffs, TRAIN) : null), [coeffs]);
  const testRMSE = useMemo(() => (coeffs ? rmse(coeffs, TEST) : null), [coeffs]);

  useEffect(() => {
    if (testRMSE === null) {
      onProgress?.(0);
      onState?.({ fitted: false });
      return;
    }
    onProgress?.(Math.min(100, (TARGET_RMSE / Math.max(0.01, testRMSE)) * 100));
    onState?.({
      degree: fittedDegree,
      trainError: Math.round(trainRMSE! * 100) / 100,
      testError: Math.round(testRMSE * 100) / 100,
    });
    if (testRMSE <= TARGET_RMSE && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testRMSE, trainRMSE, fittedDegree]);

  function fit() {
    setCoeffs(fitPoly(TRAIN, degree));
    setFittedDegree(degree);
  }

  const curve = useMemo(() => {
    if (!coeffs) return "";
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / 60;
      pts.push(`${sx(x).toFixed(1)},${sy(evalPoly(coeffs, x)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [coeffs]);

  const overfit = coeffs && trainRMSE !== null && testRMSE !== null && testRMSE - trainRMSE > 0.35;

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
          <LineChart className="h-4 w-4 text-accent" /> Your predictor
        </span>
        {testRMSE !== null ? (
          <>
            <span className="text-txt3">
              Error on new points: <b style={{ color: testRMSE <= TARGET_RMSE ? "var(--ok)" : undefined }} className="text-txt">{testRMSE.toFixed(2)}</b>
              <span className="text-txt3"> · goal under {TARGET_RMSE}</span>
            </span>
            <span className="text-txt3">On its own points: <b className="text-txt2">{trainRMSE!.toFixed(2)}</b></span>
          </>
        ) : (
          <span className="text-txt3">Pick how bendy, then press Fit.</span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border2 bg-panel">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a3a55" strokeWidth={1} />
          {curve && <polyline points={curve} fill="none" stroke="#c084fc" strokeWidth={2.5} />}
          {TRAIN.map((p, i) => (
            <circle key={`tr${i}`} cx={sx(p.x)} cy={sy(p.y)} r={4} fill="#00e0c0" fillOpacity={0.9} />
          ))}
          {TEST.map((p, i) => (
            <circle key={`te${i}`} cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill="none" stroke="#ffb000" strokeWidth={2} />
          ))}
        </svg>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-4 text-[11px] text-txt3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#00e0c0]" /> training dots</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-[#ffb000]" /> new dots (test)</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-txt2">How bendy?</span>
        <div className="inline-flex overflow-hidden rounded-md border border-border2">
          {[1, 2, 3, 4].map((d) => (
            <button
              key={d}
              onClick={() => setDegree(d)}
              className={`px-2.5 py-1 text-[12px] transition-colors ${degree === d ? "bg-accent text-accent-ink" : "bg-panel text-txt3 hover:text-txt"}`}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-txt3">{DEGREE_LABEL[degree]}</span>
        <button
          onClick={fit}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110"
        >
          <Sparkles className="h-3.5 w-3.5" /> Fit
        </button>
      </div>

      {overfit && (
        <p className="mt-2 text-[11px] text-txt3">
          💡 Great on its own dots, worse on new ones — that&apos;s <b className="text-txt2">overfitting</b>. The curve is too
          bendy and chased the noise. Try a lower number.
        </p>
      )}
    </div>
  );
}
