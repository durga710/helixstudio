"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Contribution insights — a stacked card on the Space detail (not a separate
 * dashboard), so it reads as the members roster getting smarter. Per-member
 * activity from data already recorded; quiet members get a subtle tag. Hides
 * itself entirely when there's nothing to show, so it never feels forced.
 */

interface MemberStat {
  userId: string;
  name: string;
  image: string | null;
  role: string;
  pushes: number;
  aiBuilds: number;
  workspaces: number;
  lastActive: string | null;
  activeDays7: number;
  submissions: number;
  quiet: boolean;
}

interface Insights {
  kind: string;
  summary: { activeThisWeek: number; pushes: number; aiBuilds: number; workspaces: number };
  members: MemberStat[];
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function SpaceContributions({ spaceId }: { spaceId: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spaces/${spaceId}/insights`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.ok) setData(j.data as Insights);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  // Seamless: render nothing until there's something worth showing.
  if (!data || data.members.length === 0) return null;

  const classroom = data.kind === "classroom";
  const s = data.summary;
  // Most active first; quiet members fall to the bottom (and carry a tag).
  const members = [...data.members].sort((a, b) => {
    const at = a.lastActive ? new Date(a.lastActive).getTime() : 0;
    const bt = b.lastActive ? new Date(b.lastActive).getTime() : 0;
    return bt - at || b.pushes + b.aiBuilds - (a.pushes + a.aiBuilds);
  });

  return (
    <Card className="mt-4 p-[18px]">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-txt">Contributions</h3>
        <span className="text-[11.5px] text-txt3">
          {s.activeThisWeek} active this week · {s.pushes} pushes · {s.aiBuilds} AI builds · {s.workspaces} workspaces
        </span>
      </div>

      <div className="divide-y divide-border/60">
        {members.map((m) => {
          const expanded = open === m.userId;
          return (
            <div key={m.userId}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : m.userId)}
                className="flex w-full items-center gap-2.5 py-2 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-panel3 text-[10px] font-semibold text-txt2">
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(m.name)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-txt">{m.name}</span>
                    {m.role === "owner" && <Pill tone="accent">{classroom ? "instructor" : "owner"}</Pill>}
                    {m.quiet && <Pill tone="amber">no activity yet</Pill>}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-txt3">
                    {m.pushes} pushes · {m.aiBuilds} builds
                    {classroom && ` · ${m.submissions} submitted`}
                    {" · "}
                    {m.lastActive ? `active ${timeAgo(m.lastActive)}` : "never active"}
                  </span>
                </span>
                {m.activeDays7 > 0 && (
                  <span className="shrink-0 text-[11px] text-txt3">active {m.activeDays7}/7d</span>
                )}
              </button>

              {expanded && (
                <div className="mb-2 ml-[38px] grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-border2 bg-panel2/50 px-3 py-2 text-[11.5px] text-txt2 sm:grid-cols-4">
                  <Stat k="Pushes" v={m.pushes} />
                  <Stat k="AI builds" v={m.aiBuilds} />
                  <Stat k="Workspaces" v={m.workspaces} />
                  {classroom ? <Stat k="Submitted" v={m.submissions} /> : <Stat k="Active days (7)" v={m.activeDays7} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <span className={cn("flex flex-col")}>
      <span className="font-mono text-[13px] text-txt">{v}</span>
      <span className="text-[10px] uppercase tracking-wide text-txt3">{k}</span>
    </span>
  );
}
