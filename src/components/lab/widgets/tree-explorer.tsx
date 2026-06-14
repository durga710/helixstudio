"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Scissors, GitBranch } from "lucide-react";
import type { WidgetProps } from "./index";
import { getDataset, featureLabel, CLASS_COLORS, type DataPoint } from "@/components/lab/datasets";

/* TreeExplorer — "Grow a tree." The student builds a real decision tree split by
 * split: click a leaf, choose a measurement + cut, add the split. The tree
 * diagram grows and accuracy climbs until it sorts the data. A hands-on build,
 * lesson-scaled (no held-out test / pruning depth — that lives in the Studio). */

const GOAL = 0.92;
const MAX_DEPTH = 3;
const SLOT = 116;
const LEVEL = 78;

interface Node {
  rows: DataPoint[];
  feature?: string;
  threshold?: number;
  left?: Node; // <= ("no")
  right?: Node; // > ("yes")
}
interface Placed {
  node: Node;
  path: string;
  x: number;
  depth: number;
}

function majority(rows: DataPoint[], classes: string[]) {
  if (rows.length === 0) return { label: classes[0], count: 0, total: 0 };
  const counts = classes.map((c) => rows.filter((p) => p.label === c).length);
  const best = counts.indexOf(Math.max(...counts));
  return { label: classes[best], count: counts[best], total: rows.length };
}
function splitRows(rows: DataPoint[], f: string, t: number) {
  return { low: rows.filter((p) => p.features[f] <= t), high: rows.filter((p) => p.features[f] > t) };
}
function predict(root: Node, p: DataPoint, classes: string[]): string {
  let n = root;
  while (n.feature) n = p.features[n.feature] > n.threshold! ? n.right! : n.left!;
  return majority(n.rows, classes).label;
}
function updateAt(node: Node, path: string, fn: (n: Node) => Node): Node {
  if (path === "") return fn(node);
  const rest = path.slice(1);
  return path[0] === "L" ? { ...node, left: updateAt(node.left!, rest, fn) } : { ...node, right: updateAt(node.right!, rest, fn) };
}
function layout(root: Node) {
  const placed: Placed[] = [];
  let leaf = 0;
  let maxDepth = 0;
  function rec(node: Node, path: string, depth: number): number {
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

export function TreeExplorer({ config, onComplete, onState }: WidgetProps) {
  const ds = useMemo(() => getDataset(typeof config?.dataset === "string" ? config.dataset : "creatures"), [config]);
  const classes = ds.classes;

  const [tree, setTree] = useState<Node>(() => ({ rows: ds.points }));
  const [sel, setSel] = useState<string | null>("");
  const [feature, setFeature] = useState(ds.featureNames[0]);
  const ranges = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const f of ds.featureNames) {
      const v = ds.points.map((p) => p.features[f]);
      m[f] = [Math.min(...v), Math.max(...v)];
    }
    return m;
  }, [ds]);
  const [threshold, setThreshold] = useState((ranges[ds.featureNames[0]][0] + ranges[ds.featureNames[0]][1]) / 2);
  const done = useRef(false);

  const { placed, leafCount, maxDepth } = useMemo(() => layout(tree), [tree]);
  const byPath = useMemo(() => new Map(placed.map((p) => [p.path, p])), [placed]);
  const acc = useMemo(() => {
    let ok = 0;
    for (const p of ds.points) if (predict(tree, p, classes) === p.label) ok++;
    return ok / ds.points.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);
  const leaves = placed.filter((p) => !p.node.feature).length;

  useEffect(() => {
    onState?.({ leaves, splits: leaves - 1, accuracy: Math.round(acc * 100) });
    if (acc >= GOAL && !done.current) {
      done.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc, leaves]);

  const selNode = sel !== null ? byPath.get(sel)?.node : undefined;
  const selLeaf = selNode && !selNode.feature;
  const selDepth = sel !== null ? byPath.get(sel)?.depth ?? 0 : 0;

  const preview = useMemo(() => {
    if (!selNode || selNode.feature) return null;
    const { low, high } = splitRows(selNode.rows, feature, threshold);
    return { low: majority(low, classes), high: majority(high, classes), empty: low.length === 0 || high.length === 0 };
  }, [selNode, feature, threshold, classes]);

  function pickFeature(f: string) {
    setFeature(f);
    setThreshold((ranges[f][0] + ranges[f][1]) / 2);
  }
  function addSplit() {
    if (sel === null || !selNode || selNode.feature || !preview || preview.empty || selDepth >= MAX_DEPTH) return;
    const f = feature;
    const t = threshold;
    setTree((cur) =>
      updateAt(cur, sel, (leaf) => {
        const { low, high } = splitRows(leaf.rows, f, t);
        return { rows: leaf.rows, feature: f, threshold: t, left: { rows: low }, right: { rows: high } };
      }),
    );
    setSel(null);
  }
  function prune() {
    if (sel === null || !selNode || !selNode.feature) return;
    setTree((cur) => updateAt(cur, sel, (n) => ({ rows: n.rows })));
  }
  function reset() {
    setTree({ rows: ds.points });
    setSel("");
    done.current = false;
  }

  const svgW = leafCount * SLOT;
  const svgH = (maxDepth + 1) * LEVEL;
  const accPct = Math.round(acc * 100);
  const colorOf = (label: string) => CLASS_COLORS[classes.indexOf(label) % CLASS_COLORS.length];

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
          <GitBranch className="h-4 w-4 text-accent" /> Your tree
        </span>
        <span className="text-txt3">
          Sorted right: <b className="text-txt" style={{ color: acc >= GOAL ? "var(--ok)" : undefined }}>{accPct}%</b>
          <span className="text-txt3"> · goal {Math.round(GOAL * 100)}%</span>
        </span>
        <span className="text-txt3">{leaves} leaf{leaves === 1 ? "" : "ves"}</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border2 bg-panel p-2">
        <svg viewBox={`0 0 ${Math.max(svgW, 240)} ${svgH}`} width={Math.max(svgW, 240)} height={svgH} className="mx-auto block">
          {placed.filter((p) => p.node.feature).map((p) =>
            ["L", "R"].map((dir) => {
              const c = byPath.get(p.path + dir);
              if (!c) return null;
              const px = p.x * SLOT + SLOT / 2;
              const py = p.depth * LEVEL + 24;
              const cx = c.x * SLOT + SLOT / 2;
              const cy = c.depth * LEVEL + 24;
              return (
                <g key={p.path + dir}>
                  <line x1={px} y1={py + 12} x2={cx} y2={cy - 12} stroke="#2a3a55" strokeWidth={1.3} />
                  <text x={(px + cx) / 2} y={(py + cy) / 2} textAnchor="middle" fill="#7d8ba3" fontSize={9}>
                    {dir === "R" ? "yes" : "no"}
                  </text>
                </g>
              );
            }),
          )}
          {placed.map((p) => {
            const cx = p.x * SLOT + SLOT / 2;
            const cy = p.depth * LEVEL + 24;
            const on = sel === p.path;
            if (p.node.feature) {
              return (
                <g key={p.path} onClick={() => setSel(p.path)} className="cursor-pointer">
                  <rect x={cx - 50} y={cy - 13} width={100} height={26} rx={7} fill="#0d1626" stroke={on ? "var(--accent)" : "#2a3a55"} strokeWidth={on ? 2 : 1} />
                  <text x={cx} y={cy + 4} textAnchor="middle" fill="#cdd8ea" fontSize={10.5}>
                    {featureLabel(p.node.feature)} &gt; {p.node.threshold}?
                  </text>
                </g>
              );
            }
            const m = majority(p.node.rows, classes);
            const conf = m.total ? Math.round((m.count / m.total) * 100) : 0;
            return (
              <g key={p.path} onClick={() => setSel(p.path)} className="cursor-pointer">
                <rect x={cx - 44} y={cy - 14} width={88} height={28} rx={8} fill="#0d1626" stroke={on ? "var(--accent)" : colorOf(m.label)} strokeWidth={on ? 2.5 : 1.5} />
                <circle cx={cx - 30} cy={cy} r={4} fill={colorOf(m.label)} />
                <text x={cx - 21} y={cy - 1} textAnchor="start" fill="#f0f4fa" fontSize={10.5} fontWeight={600}>
                  {m.label}
                </text>
                <text x={cx - 21} y={cy + 9} textAnchor="start" fill="#7d8ba3" fontSize={8}>
                  {m.total} · {conf}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 rounded-md border border-border2 bg-panel p-3">
        {sel === null || !selNode ? (
          <p className="text-center text-[12px] text-txt3">Click a colored leaf above to split it.</p>
        ) : selLeaf ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-txt2">Split these {selNode.rows.length} by:</span>
              {ds.featureNames.map((f) => (
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
            </div>
            <label className="mt-2.5 flex items-center gap-2 text-[11.5px] text-txt3">
              <span className="w-16 shrink-0">cut at {threshold}</span>
              <input
                type="range"
                min={ranges[feature][0]}
                max={ranges[feature][1]}
                step={(ranges[feature][1] - ranges[feature][0]) / 100}
                value={threshold}
                onChange={(e) => setThreshold(Math.round(Number(e.target.value) * 10) / 10)}
                className="flex-1 accent-[var(--accent)]"
              />
            </label>
            {preview && (
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-md border border-border2 bg-panel2 px-2.5 py-1.5">
                  no (≤ {threshold}) → <b style={{ color: colorOf(preview.low.label) }}>{preview.low.label}</b>{" "}
                  <span className="text-txt3">({preview.low.total})</span>
                </div>
                <div className="rounded-md border border-border2 bg-panel2 px-2.5 py-1.5">
                  yes (&gt; {threshold}) → <b style={{ color: colorOf(preview.high.label) }}>{preview.high.label}</b>{" "}
                  <span className="text-txt3">({preview.high.total})</span>
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11.5px] text-txt3">
                {selDepth >= MAX_DEPTH ? "Deep enough — try another leaf." : preview?.empty ? "That cut leaves one side empty — move it." : "Aim for each side mostly one color."}
              </span>
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
            <span className="text-[12px] text-txt3">A question node ({featureLabel(selNode.feature!)} &gt; {selNode.threshold}).</span>
            <button
              onClick={prune}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-bad hover:text-txt"
            >
              <Scissors className="h-3.5 w-3.5" /> Prune
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button onClick={reset} className="text-[11.5px] text-txt3 transition-colors hover:text-txt">
          Start over
        </button>
        <span className="text-[11.5px] text-txt3">Each split asks one yes/no question — together they sort everything.</span>
      </div>
    </div>
  );
}
