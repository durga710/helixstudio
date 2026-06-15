"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Plus, Wand2, TreePine, Play, Pause, Flame } from "lucide-react";
import type { StudioProps } from "./index";
import { InfoTip } from "@/components/lab/info-tip";
import { StudioCoach } from "@/components/lab/studio-coach";
import { getDataset, featureLabel, CLASS_COLORS, type DataPoint } from "@/components/lab/datasets";

/* Decision Tree Studio — the hero build loop. The student grows a real decision
 * tree node by node: click a leaf, pick a measurement + cut, Add split. The
 * tree diagram grows, and accuracy on a HELD-OUT test set climbs (or, if they
 * over-split, falls — overfitting, felt first-hand). Prune to undo. Pure JS. */

const TARGET = 0.85; // goal: test accuracy
const MAX_DEPTH = 5; // bound the diagram + let a little overfitting happen

interface TreeNode {
  rows: DataPoint[];
  feature?: string;
  threshold?: number;
  left?: TreeNode; // <= threshold ("no")
  right?: TreeNode; // > threshold ("yes")
}

interface Placed {
  node: TreeNode;
  path: string;
  x: number;
  depth: number;
}

/** A pet currently flowing down the tree in the live sorting machine. */
interface Flyer {
  id: number;
  pet: DataPoint;
  route: string[];
  step: number;
  landed?: boolean;
  correct?: boolean;
}

/* ---- pure tree helpers ---- */

function majority(rows: DataPoint[], classes: string[]): { label: string; count: number; total: number } {
  if (rows.length === 0) return { label: classes[0], count: 0, total: 0 };
  const counts = classes.map((c) => rows.filter((p) => p.label === c).length);
  const best = counts.indexOf(Math.max(...counts));
  return { label: classes[best], count: counts[best], total: rows.length };
}

function predict(root: TreeNode, p: DataPoint): string {
  let n = root;
  while (n.feature) n = p.features[n.feature] > n.threshold! ? n.right! : n.left!;
  return majority(n.rows, CLASSES).label;
}

/** The sequence of node paths a pet visits, root → leaf (for the "run a pet" animation). */
function routeOf(root: TreeNode, p: DataPoint): string[] {
  const out = [""];
  let n = root;
  let key = "";
  while (n.feature) {
    const goRight = p.features[n.feature] > n.threshold!;
    key += goRight ? "R" : "L";
    n = goRight ? n.right! : n.left!;
    out.push(key);
  }
  return out;
}

function accuracy(root: TreeNode, data: DataPoint[]): number {
  if (data.length === 0) return 0;
  let ok = 0;
  for (const p of data) if (predict(root, p) === p.label) ok++;
  return ok / data.length;
}

function gini(rows: DataPoint[], classes: string[]): number {
  if (rows.length === 0) return 0;
  let s = 0;
  for (const c of classes) {
    const f = rows.filter((p) => p.label === c).length / rows.length;
    s += f * f;
  }
  return 1 - s;
}

function splitRows(rows: DataPoint[], feature: string, threshold: number) {
  const low = rows.filter((p) => p.features[feature] <= threshold);
  const high = rows.filter((p) => p.features[feature] > threshold);
  return { low, high };
}

function gain(rows: DataPoint[], feature: string, threshold: number, classes: string[]): number {
  const { low, high } = splitRows(rows, feature, threshold);
  if (low.length === 0 || high.length === 0) return 0;
  const before = gini(rows, classes);
  const after = (low.length / rows.length) * gini(low, classes) + (high.length / rows.length) * gini(high, classes);
  return before - after;
}

function bestSplit(rows: DataPoint[], featureNames: string[], classes: string[]) {
  let best = { feature: featureNames[0], threshold: 0, gain: -1 };
  for (const f of featureNames) {
    const vals = [...new Set(rows.map((p) => p.features[f]))].sort((a, b) => a - b);
    for (let i = 0; i < vals.length - 1; i++) {
      const t = (vals[i] + vals[i + 1]) / 2;
      const g = gain(rows, f, t, classes);
      if (g > best.gain) best = { feature: f, threshold: t, gain: g };
    }
  }
  return best;
}

/** Immutable update of the node at `path` ("" = root, then L/R chars). */
function updateAt(node: TreeNode, path: string, fn: (n: TreeNode) => TreeNode): TreeNode {
  if (path === "") return fn(node);
  const rest = path.slice(1);
  return path[0] === "L"
    ? { ...node, left: updateAt(node.left!, rest, fn) }
    : { ...node, right: updateAt(node.right!, rest, fn) };
}

function layout(root: TreeNode) {
  const placed: Placed[] = [];
  let leaf = 0;
  let maxDepth = 0;
  function rec(node: TreeNode, path: string, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    if (!node.feature) {
      const x = leaf++;
      placed.push({ node, path, x, depth });
      return x;
    }
    const lx = rec(node.left!, path + "L", depth + 1);
    const rx = rec(node.right!, path + "R", depth + 1);
    const x = (lx + rx) / 2;
    placed.push({ node, path, x, depth });
    return x;
  }
  rec(root, "", 0);
  return { placed, leafCount: Math.max(1, leaf), maxDepth };
}

// The studio is fixed to the "creatures" (pets) dataset.
const DS = getDataset("creatures");
const CLASSES = DS.classes;
const TRAIN = DS.points.filter((_, i) => i % 3 !== 2);
const TEST = DS.points.filter((_, i) => i % 3 === 2);

const SLOT = 124;
const LEVEL = 82;

/** The guided build-along script. */
const LEARN_STEPS: { text: string; cta?: string }[] = [
  { text: 'Your tree starts by guessing the same answer for every pet. Let’s teach it to ask a question. Pick a clue to split on — tap "Ears", "Weight" or "Tail" below.' },
  { text: 'Now slide "the cut". The two boxes show which pets land on each side — aim for each side to be mostly ONE color. (Stuck? Tap "Suggest".)' },
  { text: 'Happy with it? Press "Add split" to add that question to your tree.' },
  { text: "See the two new branches? Each leaf now holds a tidier group. Click another mixed leaf and split it too — keep going until you’re 85% on new pets.", cta: "Got it" },
];

export function TreeStudio({ onProgress, onComplete, onState }: StudioProps) {
  const [learnStep, setLearnStep] = useState(0);
  const [tree, setTree] = useState<TreeNode>(() => ({ rows: TRAIN }));
  const [sel, setSel] = useState<string | null>("");
  const [feature, setFeature] = useState(DS.featureNames[0]);
  const fullRange = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const f of DS.featureNames) {
      const v = DS.points.map((p) => p.features[f]);
      m[f] = [Math.min(...v), Math.max(...v)];
    }
    return m;
  }, []);
  const [threshold, setThreshold] = useState((fullRange[DS.featureNames[0]][0] + fullRange[DS.featureNames[0]][1]) / 2);

  // Live "sorting machine": pets continuously flow down the tree into their group.
  const [machineOn, setMachineOn] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sorted, setSorted] = useState(0);
  const [hits, setHits] = useState(0);
  const [flyersView, setFlyersView] = useState<Flyer[]>([]);
  const flyers = useRef<Flyer[]>([]);
  const flyId = useRef(0);
  const queue = useRef<DataPoint[]>([]);
  const streakRef = useRef(0);
  const treeRef = useRef(tree);
  const spawnTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const { placed, leafCount, maxDepth } = useMemo(() => layout(tree), [tree]);
  const byPath = useMemo(() => new Map(placed.map((p) => [p.path, p])), [placed]);

  const trainAcc = useMemo(() => accuracy(tree, TRAIN), [tree]);
  const testAcc = useMemo(() => accuracy(tree, TEST), [tree]);
  const leafCountTotal = placed.filter((p) => !p.node.feature).length;
  const splitCount = placed.filter((p) => p.node.feature).length;
  const gap = trainAcc - testAcc;
  const goalMet = testAcc >= TARGET;

  const completed = useRef(false);
  useEffect(() => {
    const tp = Math.round(testAcc * 100);
    const rp = Math.round(trainAcc * 100);
    let narration: string;
    if (splitCount === 0) {
      narration = `Right now your tree asks no questions — it just guesses the most common pet for everyone, so it's ${tp}% right on new pets. Click a leaf and split it to do better.`;
    } else {
      narration = `Your tree asks ${splitCount} question${splitCount === 1 ? "" : "s"}. It's ${tp}% right on new pets it's never seen (${rp}% on its practice pets).`;
      if (gap > 0.18) narration += " It does much better on practice than on new pets — that's overfitting (memorizing). Try pruning a split.";
      else if (tp >= 85) narration += " That clears the goal — nice work.";
      else narration += " Click a still-mixed leaf and split it to push the new-pet score up.";
    }
    onProgress?.(Math.min(100, (testAcc / TARGET) * 100));
    onState?.({ leaves: leafCountTotal, splits: splitCount, depth: maxDepth, trainAccuracy: rp, testAccuracy: tp, narration });
    if (goalMet && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testAcc, trainAcc, splitCount, leafCountTotal, maxDepth]);

  const selNode = sel !== null ? byPath.get(sel)?.node : undefined;
  const selIsLeaf = selNode ? !selNode.feature : false;
  const selDepth = sel !== null ? byPath.get(sel)?.depth ?? 0 : 0;

  // Live preview of the split the student is about to add to the selected leaf.
  const preview = useMemo(() => {
    if (!selNode || selNode.feature) return null;
    const { low, high } = splitRows(selNode.rows, feature, threshold);
    return {
      low: majority(low, CLASSES),
      high: majority(high, CLASSES),
      gain: gain(selNode.rows, feature, threshold, CLASSES),
      empty: low.length === 0 || high.length === 0,
    };
  }, [selNode, feature, threshold]);

  // Is the selected leaf already all one kind (no use splitting it)?
  const selMajority = selNode && !selNode.feature ? majority(selNode.rows, CLASSES) : null;
  const selPure = selMajority ? selMajority.count === selMajority.total : false;

  function pickFeature(f: string) {
    setFeature(f);
    setThreshold((fullRange[f][0] + fullRange[f][1]) / 2);
    if (learnStep === 0) setLearnStep(1);
  }
  function bumpThreshold(v: number) {
    setThreshold(Math.round(v * 10) / 10);
    if (learnStep === 1) setLearnStep(2);
  }

  function addSplit() {
    if (sel === null || !selNode || selNode.feature || !preview || preview.empty || selDepth >= MAX_DEPTH) return;
    flyers.current = [];
    const f = feature;
    const t = threshold;
    const next = updateAt(tree, sel, (leaf) => {
      const { low, high } = splitRows(leaf.rows, f, t);
      return { rows: leaf.rows, feature: f, threshold: t, left: { rows: low }, right: { rows: high } };
    });
    setTree(next);
    // Nudge the student to the messier new leaf.
    const child = sel + (gini(splitRows(selNode.rows, f, t).low, CLASSES) >= gini(splitRows(selNode.rows, f, t).high, CLASSES) ? "L" : "R");
    setSel(child);
    if (learnStep < 3) setLearnStep(3);
  }

  function suggest() {
    if (!selNode || selNode.feature) return;
    const b = bestSplit(selNode.rows, DS.featureNames, CLASSES);
    if (b.gain > 0) {
      setFeature(b.feature);
      setThreshold(Math.round(b.threshold * 10) / 10);
    }
    if (learnStep <= 1) setLearnStep(2);
  }

  function prune() {
    if (sel === null || !selNode || !selNode.feature) return;
    flyers.current = [];
    setTree(updateAt(tree, sel, (n) => ({ rows: n.rows })));
  }

  function shuffled(): DataPoint[] {
    const r = [...DS.points];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
  function spawnFlyer() {
    if (flyers.current.filter((f) => !f.landed).length >= 5) return;
    if (queue.current.length === 0) queue.current = shuffled();
    const pet = queue.current.pop()!;
    flyers.current = [...flyers.current, { id: flyId.current++, pet, route: routeOf(treeRef.current, pet), step: 0 }];
    setFlyersView(flyers.current);
  }
  function tickFlyers() {
    const next: Flyer[] = [];
    let dScore = 0;
    let dSorted = 0;
    let dHits = 0;
    let s = streakRef.current;
    for (const f of flyers.current) {
      if (f.landed) continue; // already showed its verdict last tick — drop it
      if (f.step >= f.route.length - 1) {
        const correct = predict(treeRef.current, f.pet) === f.pet.label;
        dSorted++;
        if (correct) {
          dHits++;
          s += 1;
          dScore += 10 + s * 2;
        } else {
          s = 0;
        }
        next.push({ ...f, landed: true, correct });
      } else {
        next.push({ ...f, step: f.step + 1 });
      }
    }
    flyers.current = next;
    if (dSorted) {
      setScore((x) => x + dScore);
      setSorted((x) => x + dSorted);
      setHits((x) => x + dHits);
      setStreak(s);
      streakRef.current = s;
    }
    setFlyersView(flyers.current);
  }
  function startMachine() {
    if (machineOn) return;
    setScore(0);
    setStreak(0);
    setSorted(0);
    setHits(0);
    streakRef.current = 0;
    flyers.current = [];
    setFlyersView([]);
    queue.current = shuffled();
    setMachineOn(true);
    spawnTimer.current = setInterval(spawnFlyer, 720);
    tickTimer.current = setInterval(tickFlyers, 260);
  }
  function stopMachine() {
    setMachineOn(false);
    if (spawnTimer.current) clearInterval(spawnTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    spawnTimer.current = null;
    tickTimer.current = null;
    flyers.current = [];
    setFlyersView(flyers.current);
  }
  useEffect(
    () => () => {
      if (spawnTimer.current) clearInterval(spawnTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
    },
    [],
  );

  const svgW = leafCount * SLOT;
  const svgH = (maxDepth + 1) * LEVEL;
  const colorOf = (label: string) => CLASS_COLORS[CLASSES.indexOf(label) % CLASS_COLORS.length];

  // Live machine derived state.
  const liveAcc = sorted > 0 ? Math.round((hits / sorted) * 100) : 0;
  const activeEdges = new Set<string>();
  for (const f of flyersView) {
    for (let k = 1; k <= Math.min(f.step, f.route.length - 1); k++) activeEdges.add(f.route[k]);
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <StudioCoach
        index={learnStep}
        total={LEARN_STEPS.length}
        done={learnStep >= LEARN_STEPS.length}
        text={
          learnStep < LEARN_STEPS.length
            ? LEARN_STEPS[learnStep].text
            : "You’ve got the hang of it — keep splitting the mixed leaves until you reach 85% on new pets."
        }
        cta={learnStep < LEARN_STEPS.length ? LEARN_STEPS[learnStep].cta : undefined}
        onNext={learnStep < LEARN_STEPS.length && LEARN_STEPS[learnStep].cta ? () => setLearnStep((s) => s + 1) : undefined}
      />


      {/* scoreboard */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
          <TreePine className="h-4 w-4 text-accent" /> Your tree
        </span>
        <span className="inline-flex items-center gap-1 text-txt3">
          On new pets (test): <b className="text-txt" style={{ color: testAcc >= TARGET ? "var(--ok)" : undefined }}>{Math.round(testAcc * 100)}%</b>
          <span className="text-txt3"> · goal {Math.round(TARGET * 100)}%</span>
          <InfoTip text="These are pets the tree never saw while you built it. Doing well here means it really learned the pattern, not just memorized." />
        </span>
        <span className="text-txt3">On its own examples (train): <b className="text-txt2">{Math.round(trainAcc * 100)}%</b></span>
        <span className="text-txt3">{leafCountTotal} leaf{leafCountTotal === 1 ? "" : "ves"}</span>
        <button
          onClick={machineOn ? stopMachine : startMachine}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-md border-none px-3 py-1.5 text-[12.5px] font-bold transition ${machineOn ? "bg-panel2 text-txt2 hover:text-txt" : "bg-accent text-accent-ink hover:brightness-110"}`}
        >
          {machineOn ? <><Pause className="h-3.5 w-3.5" /> Stop</> : <><Play className="h-3.5 w-3.5" /> Start sorting!</>}
        </button>
      </div>

      {/* live machine HUD */}
      {machineOn && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] px-3 py-2 text-[12.5px]">
          <span className="font-bold text-txt">Score <span className="text-accent">{score}</span></span>
          <span className="inline-flex items-center gap-1 text-txt2">
            <Flame className={`h-3.5 w-3.5 ${streak >= 3 ? "text-bad" : "text-txt3"}`} /> streak <b className="text-txt">{streak}</b>
          </span>
          <span className="text-txt3">sorted <b className="text-txt2">{sorted}</b></span>
          <span className="text-txt3">live accuracy <b style={{ color: liveAcc >= 85 ? "var(--ok)" : "var(--txt)" }}>{liveAcc}%</b></span>
          <span className="ml-auto text-[11px] text-txt3">keep splitting glowing leaves to sort more correctly →</span>
        </div>
      )}

      {/* tree diagram */}
      <div className="overflow-x-auto rounded-md border border-border2 bg-panel p-2">
        <svg viewBox={`0 0 ${Math.max(svgW, 280)} ${svgH}`} width={Math.max(svgW, 280)} height={svgH} className="mx-auto block">
          {/* edges */}
          {placed.filter((p) => p.node.feature).map((p) => {
            const px = p.x * SLOT + SLOT / 2;
            const py = p.depth * LEVEL + 26;
            return ["L", "R"].map((dir) => {
              const c = byPath.get(p.path + dir);
              if (!c) return null;
              const cx = c.x * SLOT + SLOT / 2;
              const cy = c.depth * LEVEL + 26;
              const onRoute = activeEdges.has(p.path + dir);
              return (
                <g key={p.path + dir}>
                  <line x1={px} y1={py + 14} x2={cx} y2={cy - 14} stroke={onRoute ? "var(--accent)" : "#2a3a55"} strokeWidth={onRoute ? 3 : 1.4} />
                  <text x={(px + cx) / 2} y={(py + cy) / 2} textAnchor="middle" fill={onRoute ? "var(--accent)" : "#7d8ba3"} fontSize={9} fontWeight={onRoute ? 700 : 400}>
                    {dir === "R" ? "yes" : "no"}
                  </text>
                </g>
              );
            });
          })}
          {/* nodes */}
          {placed.map((p) => {
            const cx = p.x * SLOT + SLOT / 2;
            const cy = p.depth * LEVEL + 26;
            const selected = sel === p.path;
            if (p.node.feature) {
              return (
                <g key={p.path} onClick={() => setSel(p.path)} className="cursor-pointer">
                  <rect x={cx - 52} y={cy - 14} width={104} height={28} rx={7} fill="#0d1626" stroke={selected ? "var(--accent)" : "#2a3a55"} strokeWidth={selected ? 2 : 1} />
                  <text x={cx} y={cy + 4} textAnchor="middle" fill="#cdd8ea" fontSize={11}>
                    {featureLabel(p.node.feature)} &gt; {p.node.threshold}?
                  </text>
                </g>
              );
            }
            const m = majority(p.node.rows, CLASSES);
            const conf = m.total ? Math.round((m.count / m.total) * 100) : 0;
            const canSplit = m.count < m.total && p.depth < MAX_DEPTH;
            return (
              <g key={p.path} onClick={() => setSel(p.path)} className="cursor-pointer">
                {/* glow on leaves that are still mixed — "click me to split" */}
                {canSplit && !selected && (
                  <rect x={cx - 51} y={cy - 19} width={102} height={40} rx={11} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" className="animate-pulse" />
                )}
                <rect x={cx - 46} y={cy - 14} width={92} height={30} rx={8} fill="#0d1626" stroke={selected ? "var(--accent)" : colorOf(m.label)} strokeWidth={selected ? 2.5 : 1.5} />
                <circle cx={cx - 32} cy={cy + 1} r={4} fill={colorOf(m.label)} />
                <text x={cx - 22} y={cy - 1} textAnchor="start" fill="#f0f4fa" fontSize={11} fontWeight={600}>
                  {m.label}
                </text>
                <text x={cx - 22} y={cy + 10} textAnchor="start" fill="#7d8ba3" fontSize={8.5}>
                  {m.total} pets · {conf}%
                </text>
              </g>
            );
          })}

          {/* pets flowing down into their group */}
          {flyersView.map((f) => {
            const pos = byPath.get(f.route[Math.min(f.step, f.route.length - 1)]);
            if (!pos) return null;
            const tx = pos.x * SLOT + SLOT / 2;
            const ty = pos.depth * LEVEL + 26;
            const col = f.landed ? (f.correct ? "var(--ok)" : "var(--bad)") : "var(--accent)";
            return (
              <g key={f.id} style={{ transform: `translate(${tx}px, ${ty}px)`, transition: "transform 0.24s linear" }}>
                <circle r={12} fill={col} fillOpacity={0.22} stroke={col} strokeWidth={2} />
                <text textAnchor="middle" dy={4.5} fontSize={13}>{f.landed ? (f.correct ? "✅" : "❌") : "🐾"}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* control panel */}
      <div className="mt-3 rounded-md border border-border2 bg-panel p-3">
        {sel === null || !selNode ? (
          <p className="text-center text-[12px] text-txt3">
            Click a <span className="font-semibold text-accent">glowing leaf</span> above — those are the groups still mixed up. Splitting one asks it a new question.
          </p>
        ) : selIsLeaf ? (
          <div>
            {selPure && (
              <p className="mb-2 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[11.5px] text-txt2">
                This group is already all one kind 🎉 — you don&apos;t need to split it. Pick a <span className="text-accent">glowing</span> (still-mixed) leaf instead.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-txt2">
                Split these {selNode.rows.length} pets by:
                <InfoTip text="A clue is a measurement you can ask about — here: weight, ear size, or tail length." />
              </span>
              {DS.featureNames.map((f) => (
                <button
                  key={f}
                  onClick={() => pickFeature(f)}
                  className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                    feature === f ? "border-accent bg-hl text-txt" : "border-border2 bg-panel2 text-txt3 hover:border-accent hover:text-txt"
                  }`}
                >
                  {featureLabel(f)}
                </button>
              ))}
              <span className="ml-auto inline-flex items-center gap-1">
                <button
                  onClick={suggest}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Best cut
                </button>
                <InfoTip text="Not sure where to cut? This finds the cut that splits these pets the cleanest." />
              </span>
            </div>

            <div className="mt-2.5">
              <div className="mb-1 inline-flex items-center gap-1 text-[11.5px] text-txt3">
                cut at {threshold}{DS.units?.[feature] ? ` ${DS.units[feature]}` : ""}
                <InfoTip text="Drag the line to set where the question splits the pets — left goes “no”, right goes “yes”. Watch the pets take sides!" />
              </div>
              <CutStrip
                rows={selNode.rows}
                feature={feature}
                lo={fullRange[feature][0]}
                hi={fullRange[feature][1]}
                threshold={threshold}
                onCut={bumpThreshold}
                colorOf={colorOf}
              />
            </div>

            {preview && (
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-md border border-border2 bg-panel2 px-2.5 py-1.5">
                  <span className="text-txt3">no (≤ {threshold}) → </span>
                  <b style={{ color: colorOf(preview.low.label) }}>{preview.low.label}</b>
                  <span className="text-txt3"> ({preview.low.total})</span>
                </div>
                <div className="rounded-md border border-border2 bg-panel2 px-2.5 py-1.5">
                  <span className="text-txt3">yes (&gt; {threshold}) → </span>
                  <b style={{ color: colorOf(preview.high.label) }}>{preview.high.label}</b>
                  <span className="text-txt3"> ({preview.high.total})</span>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              {selDepth >= MAX_DEPTH ? (
                <span className="text-[11.5px] text-txt3">This branch is deep enough — try pruning or splitting elsewhere.</span>
              ) : (
                <span className="text-[11.5px] text-txt3">
                  {preview?.empty ? "That cut leaves one side empty — move it." : "Good cuts make each side mostly one color."}
                </span>
              )}
              <button
                onClick={addSplit}
                disabled={!preview || preview.empty || selDepth >= MAX_DEPTH}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add split
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-txt3">
              This is a question node ({featureLabel(selNode.feature!)} &gt; {selNode.threshold}). Prune it to fold the branch back into one leaf.
            </span>
            <button
              onClick={prune}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-bad hover:text-txt"
            >
              <Scissors className="h-3.5 w-3.5" /> Prune
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* "See the cut" — the selected leaf's pets laid out along one clue, with a
 * draggable line you slide to split them. Makes the abstract threshold tactile:
 * you watch the real pets fall onto the "no" / "yes" side as you drag. */
function CutStrip({
  rows,
  feature,
  lo,
  hi,
  threshold,
  onCut,
  colorOf,
}: {
  rows: DataPoint[];
  feature: string;
  lo: number;
  hi: number;
  threshold: number;
  onCut: (v: number) => void;
  colorOf: (label: string) => string;
}) {
  const SW = 300;
  const SH = 66;
  const PAD = 14;
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const sx = (v: number) => PAD + ((v - lo) / (hi - lo || 1)) * (SW - PAD * 2);
  const tx = sx(threshold);

  function setFromClient(clientX: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onCut(lo + frac * (hi - lo));
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SW} ${SH}`}
      className="w-full touch-none select-none rounded-md border border-border2 bg-panel"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = true;
        setFromClient(e.clientX);
      }}
      onPointerMove={(e) => {
        if (drag.current) setFromClient(e.clientX);
      }}
      onPointerUp={() => {
        drag.current = false;
      }}
    >
      {/* "no" side tint */}
      <rect x={0} y={0} width={tx} height={SH} fill="var(--accent)" opacity={0.06} />
      {/* the pets along this clue */}
      {rows.map((p, i) => {
        const x = sx(p.features[feature]);
        const y = PAD + ((i * 13) % (SH - PAD * 2));
        return <circle key={i} cx={x} cy={y} r={4} fill={colorOf(p.label)} stroke="#0d1626" strokeWidth={1} />;
      })}
      {/* the draggable cut */}
      <line x1={tx} y1={3} x2={tx} y2={SH - 3} stroke="var(--accent)" strokeWidth={2.5} />
      <circle cx={tx} cy={9} r={7} fill="var(--accent)" className="cursor-ew-resize" />
      <text x={5} y={SH - 4} fontSize={9} fill="#7d8ba3">← no</text>
      <text x={SW - 5} y={SH - 4} textAnchor="end" fontSize={9} fill="#7d8ba3">yes →</text>
    </svg>
  );
}
