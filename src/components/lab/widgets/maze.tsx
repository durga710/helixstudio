"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Zap, RotateCcw, FlaskConical, Trophy, Bot } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * Maze — reinforcement learning you can watch. The learner sets REWARDS (reach
 * the exit / hit a wall / take a step), then trains a real tabular Q-learning
 * agent over hundreds of fast episodes and watches it go from random bumbling to
 * a clean path. A "bad rewards" preset shows how a wrong reward (loving walls)
 * breaks behaviour. No AI spend — the agent learns by trial and error in-browser.
 * Teaches: you don't program the path, you shape rewards. Completes once the
 * trained agent solves the maze on its own.
 */

interface Maze { grid: number[][]; rows: number; cols: number; start: [number, number]; goal: [number, number] }

// Randomized-DFS "perfect" maze on a (2W+1)x(2H+1) grid — always solvable.
function genMaze(W: number, H: number): Maze {
  const rows = 2 * H + 1, cols = 2 * W + 1;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1));
  const stack: [number, number][] = [[1, 1]];
  grid[1][1] = 0;
  const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = dirs
      .map(([dr, dc]) => [r + dr, c + dc, r + dr / 2, c + dc / 2] as const)
      .filter(([nr, nc]) => nr > 0 && nr < rows && nc > 0 && nc < cols && grid[nr][nc] === 1);
    if (!opts.length) { stack.pop(); continue; }
    const [nr, nc, wr, wc] = opts[Math.floor(Math.random() * opts.length)];
    grid[wr][wc] = 0;
    grid[nr][nc] = 0;
    stack.push([nr, nc]);
  }
  return { grid, rows, cols, start: [1, 1], goal: [rows - 2, cols - 2] };
}

const ACT = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up down left right
const ALPHA = 0.4, GAMMA = 0.95, EPS = 0.2, MAX_STEPS = 220, BATCH = 250;

export function Maze({ onComplete, onState }: WidgetProps) {
  const [maze, setMaze] = useState<Maze>(() => genMaze(4, 4));
  const { grid, rows, cols, start, goal } = maze;
  const q = useRef<Float32Array>(new Float32Array(rows * cols * 4));
  const [goalR, setGoalR] = useState(10);
  const [wallR, setWallR] = useState(-5);
  const [stepR, setStepR] = useState(-0.1);
  const [rounds, setRounds] = useState(0);
  const [success, setSuccess] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const [agent, setAgent] = useState<[number, number]>(start);
  const [playing, setPlaying] = useState(false);
  const [chaos, setChaos] = useState(false);
  const completed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qi = useCallback((r: number, c: number, a: number) => (r * cols + c) * 4 + a, [cols]);
  const isWall = useCallback((r: number, c: number) => r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] === 1, [grid, rows, cols]);

  const stepEnv = useCallback((r: number, c: number, a: number) => {
    const nr = r + ACT[a][0], nc = c + ACT[a][1];
    if (isWall(nr, nc)) return { r, c, bumped: true };
    return { r: nr, c: nc, bumped: false };
  }, [isWall]);

  const reward = useCallback((nr: number, nc: number, bumped: boolean) => {
    if (nr === goal[0] && nc === goal[1]) return goalR;
    if (bumped) return wallR;
    return stepR;
  }, [goal, goalR, wallR, stepR]);

  const bestQ = useCallback((r: number, c: number) => {
    const b = qi(r, c, 0);
    return Math.max(q.current[b], q.current[b + 1], q.current[b + 2], q.current[b + 3]);
  }, [qi]);

  const argmax = useCallback((r: number, c: number) => {
    const b = qi(r, c, 0);
    let best = 0;
    for (let a = 1; a < 4; a++) if (q.current[b + a] > q.current[b + best]) best = a;
    return best;
  }, [qi]);

  const greedyPath = useCallback(() => {
    const path: [number, number][] = [[start[0], start[1]]];
    const seen = new Set<string>();
    let [r, c] = start;
    for (let t = 0; t < MAX_STEPS; t++) {
      if (r === goal[0] && c === goal[1]) return { path, solved: true };
      if (seen.has(`${r},${c}`)) break;
      seen.add(`${r},${c}`);
      const { r: nr, c: nc } = stepEnv(r, c, argmax(r, c));
      if (nr === r && nc === c) break;
      r = nr; c = nc;
      path.push([r, c]);
    }
    return { path, solved: r === goal[0] && c === goal[1] };
  }, [start, goal, stepEnv, argmax]);

  const train = useCallback(() => {
    let wins = 0;
    for (let ep = 0; ep < BATCH; ep++) {
      let [r, c] = start;
      for (let t = 0; t < MAX_STEPS; t++) {
        const a = Math.random() < EPS ? Math.floor(Math.random() * 4) : argmax(r, c);
        const { r: nr, c: nc, bumped } = stepEnv(r, c, a);
        const done = nr === goal[0] && nc === goal[1];
        const rwd = reward(nr, nc, bumped);
        const idx = qi(r, c, a);
        q.current[idx] += ALPHA * (rwd + (done ? 0 : GAMMA * bestQ(nr, nc)) - q.current[idx]);
        r = nr; c = nc;
        if (done) { wins++; break; }
      }
    }
    setRounds((x) => x + BATCH);
    setSuccess(Math.round((wins / BATCH) * 100));
    const gp = greedyPath();
    if (gp.solved) setBest((b) => (b === null ? gp.path.length - 1 : Math.min(b, gp.path.length - 1)));
  }, [start, goal, argmax, stepEnv, reward, qi, bestQ, greedyPath]);

  const watch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const gp = greedyPath();
    setPlaying(true);
    let k = 0;
    const tick = () => {
      if (k >= gp.path.length) {
        setPlaying(false);
        if (gp.solved && !completed.current) { completed.current = true; onComplete(); }
        return;
      }
      setAgent(gp.path[k]);
      k++;
      timer.current = setTimeout(tick, 130);
    };
    tick();
  }, [greedyPath, onComplete]);

  function resetBrain() {
    q.current = new Float32Array(rows * cols * 4);
    setRounds(0); setSuccess(null); setBest(null); setAgent(start);
  }
  function newMaze() {
    if (timer.current) clearTimeout(timer.current);
    const m = genMaze(4, 4);
    q.current = new Float32Array(m.rows * m.cols * 4);
    setMaze(m); setRounds(0); setSuccess(null); setBest(null); setAgent(m.start); setPlaying(false);
  }
  function toggleChaos() {
    const on = !chaos;
    setChaos(on);
    setWallR(on ? 6 : -5); // loving walls = broken behaviour
    resetBrain();
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    onState?.({ rounds, successRate: success, bestSteps: best, solved: completed.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, success, best]);

  const cell = Math.max(16, Math.min(30, Math.floor(300 / cols)));

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">
        You don&apos;t tell the robot the path — you set the <b className="text-txt">rewards</b> and it figures the rest out by trial and error.
      </p>

      <div className="flex flex-wrap gap-4">
        {/* Maze */}
        <div className="shrink-0">
          <div
            className="grid gap-0 rounded-[8px] border border-border bg-panel p-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)` }}
          >
            {grid.flatMap((row, r) =>
              row.map((v, c) => {
                const isAgent = agent[0] === r && agent[1] === c;
                const isGoal = goal[0] === r && goal[1] === c;
                const isStart = start[0] === r && start[1] === c;
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{ width: cell, height: cell, background: v === 1 ? "var(--border2)" : isGoal ? "color-mix(in srgb, var(--ok) 28%, transparent)" : "transparent" }}
                    className="grid place-items-center"
                  >
                    {isAgent && <Bot className="text-accent" style={{ width: cell * 0.7, height: cell * 0.7 }} />}
                    {!isAgent && isGoal && <Trophy className="text-ok" style={{ width: cell * 0.6, height: cell * 0.6 }} />}
                    {!isAgent && isStart && !isGoal && <span className="text-[9px] font-bold text-txt3">S</span>}
                  </div>
                );
              }),
            )}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-txt3">
            <span>Rounds: <b className="text-txt2 tabular-nums">{rounds}</b></span>
            {success !== null && <span>Reaches exit: <b className="tabular-nums" style={{ color: success > 60 ? "var(--ok)" : "var(--warn)" }}>{success}%</b></span>}
            {best !== null && <span>Best path: <b className="text-txt2 tabular-nums">{best}</b></span>}
          </div>
        </div>

        {/* Rewards + controls */}
        <div className="min-w-[180px] flex-1 space-y-3">
          <Slider label="Reach exit" value={goalR} min={0} max={20} step={1} onChange={(v) => { setGoalR(v); }} />
          <Slider label="Hit a wall" value={wallR} min={-10} max={10} step={1} onChange={(v) => { setWallR(v); setChaos(false); }} />
          <Slider label="Take a step" value={stepR} min={-2} max={0} step={0.1} onChange={setStepR} />

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button onClick={train} disabled={playing} className="inline-flex items-center gap-1.5 rounded-[9px] border-none bg-accent px-3 py-2 text-[12.5px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40">
              <Zap className="h-3.5 w-3.5" /> Train ×{BATCH}
            </button>
            <button onClick={watch} disabled={playing || rounds === 0} className="inline-flex items-center gap-1.5 rounded-[9px] border border-border2 bg-panel px-3 py-2 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-40">
              <Play className="h-3.5 w-3.5" /> Watch it go
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={toggleChaos} className="inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] transition-colors" style={chaos ? { borderColor: "var(--bad)", color: "var(--txt)" } : { borderColor: "var(--border2)", color: "var(--txt2)" }}>
              <FlaskConical className="h-3.5 w-3.5" /> Bad rewards
            </button>
            <button onClick={resetBrain} className="inline-flex items-center gap-1.5 rounded-[9px] border border-border2 bg-panel px-2.5 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
              <RotateCcw className="h-3.5 w-3.5" /> Forget
            </button>
            <button onClick={newMaze} className="inline-flex items-center gap-1.5 rounded-[9px] border border-border2 bg-panel px-2.5 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
              New maze
            </button>
          </div>
          {chaos && <p className="text-[11.5px] leading-relaxed text-bad">Walls now give a reward — so the robot learns to crash into them on purpose. Wrong reward, wrong behaviour.</p>}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11.5px] text-txt2">
        {label} <span className="tabular-nums text-txt3">{value > 0 ? `+${value}` : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  );
}
