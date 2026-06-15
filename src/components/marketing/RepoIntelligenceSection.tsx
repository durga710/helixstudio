"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Boxes, Brain, FileSearch, Layers } from "lucide-react";
import { Reveal } from "./Reveal";

const CAPABILITIES = [
  { icon: Boxes, title: "Repository indexing", body: "Every file embedded the moment you connect a repo — no setup." },
  { icon: FileSearch, title: "Semantic search", body: "Ask in plain English; Helix finds the code that matters, not just keyword hits." },
  { icon: Brain, title: "Code understanding", body: "Maps architecture, data flow, and dependencies into a working model." },
  { icon: Layers, title: "Context retrieval", body: "Pulls exactly the right files into the agent's context for each task." },
];

// Graph layout in a 360×280 viewBox: a central query node linked to file nodes.
const CENTER = { x: 180, y: 140 };
const NODES = [
  { id: "auth", label: "auth.ts", x: 70, y: 56 },
  { id: "db", label: "schema.prisma", x: 300, y: 64 },
  { id: "api", label: "api/", x: 56, y: 150 },
  { id: "ui", label: "DataTable.tsx", x: 312, y: 158 },
  { id: "hooks", label: "useUser.ts", x: 92, y: 234 },
  { id: "pay", label: "billing.ts", x: 288, y: 232 },
];

function RepoGraph() {
  const reduced = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [active, setActive] = useState(reduced ? -1 : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % NODES.length), 900);
    return () => window.clearInterval(id);
  }, [reduced, inView]);

  return (
    <svg ref={ref} viewBox="0 0 360 280" className="h-auto w-full" role="img" aria-label="Repository graph: a query node retrieving related files">
      {/* edges */}
      {NODES.map((n, i) => {
        const lit = reduced || i === active;
        return (
          <motion.line
            key={`e-${n.id}`}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={n.x}
            y2={n.y}
            stroke={lit ? "var(--accent)" : "var(--border-2)"}
            strokeWidth={lit ? 1.6 : 1}
            initial={false}
            animate={{ opacity: lit ? 1 : 0.4 }}
            transition={{ duration: 0.3 }}
          />
        );
      })}

      {/* file nodes */}
      {NODES.map((n, i) => {
        const lit = reduced || i === active;
        return (
          <g key={n.id}>
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={lit ? 7 : 5}
              fill={lit ? "var(--accent)" : "var(--panel-3)"}
              stroke={lit ? "var(--accent)" : "var(--border-2)"}
              strokeWidth={1}
              initial={false}
              animate={{ scale: lit ? 1 : 0.9 }}
              transition={{ duration: 0.3 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            />
            <text
              x={n.x}
              y={n.y - 12}
              textAnchor="middle"
              className="font-mono"
              fontSize="9"
              fill={lit ? "var(--txt)" : "var(--txt-3)"}
            >
              {n.label}
            </text>
          </g>
        );
      })}

      {/* central query node */}
      <circle cx={CENTER.x} cy={CENTER.y} r={22} fill="color-mix(in srgb, var(--accent) 16%, transparent)" stroke="var(--accent)" strokeWidth="1.4" />
      <text x={CENTER.x} y={CENTER.y + 3} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--accent)">
        query
      </text>
      {!reduced && (
        <motion.circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={22}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.2"
          animate={{ r: [22, 34], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}

export function RepoIntelligenceSection() {
  return (
    <section id="repo" className="py-[84px]">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <Reveal from="right">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Repository intelligence</span>
          <h2 className="mt-2.5 text-[clamp(26px,4vw,40px)] font-bold tracking-tight text-txt">
            It reads your whole codebase — before it writes a line.
          </h2>
          <p className="mt-3 text-base text-txt2">
            Connect a repo and Helix indexes every file, understands how it fits together, and retrieves the right
            context for each request.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((c, i) => (
              <Reveal as="div" key={c.title} delay={i * 0.06}>
                <div className="flex h-full gap-3 rounded-xl border border-border bg-panel p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
                    <c.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-txt">{c.title}</span>
                    <span className="mt-0.5 block text-[12px] text-txt2">{c.body}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        <Reveal from="left" delay={0.1}>
          <div className="relative rounded-2xl border border-border bg-panel/40 p-6">
            <div className="helix-grid pointer-events-none absolute inset-0 rounded-2xl opacity-40" aria-hidden />
            <RepoGraph />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
