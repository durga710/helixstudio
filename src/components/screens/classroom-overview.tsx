/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount + refresh, same pattern as the other space data panels */
"use client";

/**
 * The instructor command center for a classroom: one card with what needs
 * attention (submissions to grade, due-soon/overdue), completion + average
 * grade, and a per-assignment breakdown with quick links. Reads
 * /api/spaces/[id]/overview (instructor-only).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, GraduationCap, Loader2, PenSquare, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { readCache, writeCache } from "@/lib/client-cache";

interface PerAssignment {
  id: string;
  title: string;
  dueAt: string | null;
  dueState: "none" | "overdue" | "soon" | "later";
  total: number;
  submitted: number;
  reviewed: number;
  in_progress: number;
  revise: number;
  notStarted: number;
}

interface Overview {
  spaceId: string;
  studentCount: number;
  assignmentCount: number;
  needsGrading: number;
  dueSoon: number;
  overdue: number;
  completionPct: number | null;
  avgGrade: number | null;
  perAssignment: PerAssignment[];
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof GraduationCap;
  value: string;
  label: string;
  tone: "accent" | "amber" | "green" | "neutral";
}) {
  const color =
    tone === "amber" ? "text-warn" : tone === "green" ? "text-ok" : tone === "accent" ? "text-accent" : "text-txt";
  return (
    <div className="rounded-card border border-border bg-panel2/40 p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-txt3">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold", color)}>{value}</div>
    </div>
  );
}

export function ClassroomOverview({ spaceId, refreshKey }: { spaceId: string; refreshKey?: string | number }) {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(() => readCache<Overview>(`space:${spaceId}:overview`));
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/overview`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setData(json.data as Overview);
        writeCache(`space:${spaceId}:overview`, json.data);
      }
    } catch {
      /* keep last snapshot */
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!data) {
    return (
      <Card className="flex items-center gap-2 p-4 text-xs text-txt3">
        <Loader2 className="h-4 w-4 animate-spin" /> loading classroom overview…
      </Card>
    );
  }

  const empty = data.assignmentCount === 0;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold">Classroom overview</h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-txt3" />}
        <button
          type="button"
          onClick={() => router.push(`/space/gradebook?s=${spaceId}`)}
          className="ml-auto text-[12px] text-accent transition-colors hover:brightness-110"
        >
          Open gradebook →
        </button>
      </div>

      {empty ? (
        <p className="text-[13px] text-txt2">
          No assignments yet. Post your first one below — this panel then shows what needs grading, what&apos;s
          due, and class completion at a glance.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Stat
              icon={PenSquare}
              value={String(data.needsGrading)}
              label="Needs grading"
              tone={data.needsGrading > 0 ? "amber" : "neutral"}
            />
            <Stat
              icon={CalendarClock}
              value={`${data.dueSoon}${data.overdue ? ` · ${data.overdue}!` : ""}`}
              label={data.overdue ? "Due soon · overdue" : "Due this week"}
              tone={data.overdue ? "amber" : "accent"}
            />
            <Stat
              icon={CheckCircle2}
              value={data.completionPct === null ? "—" : `${data.completionPct}%`}
              label="Turned in"
              tone="green"
            />
            <Stat
              icon={TrendingUp}
              value={data.avgGrade === null ? "—" : `${data.avgGrade}%`}
              label="Avg grade"
              tone="neutral"
            />
          </div>

          <div className="mt-4">
            <div className="label-tactical mb-1.5 text-[10px]">Per assignment</div>
            <ul className="space-y-1">
              {data.perAssignment.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/space/assignments/${a.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-panel2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-txt">{a.title}</span>
                    {a.dueState === "overdue" && (
                      <Pill tone="amber">
                        <AlertTriangle className="h-3 w-3" /> overdue
                      </Pill>
                    )}
                    {a.dueState === "soon" && (
                      <Pill tone="accent">
                        <CalendarClock className="h-3 w-3" /> due soon
                      </Pill>
                    )}
                    {a.submitted > 0 && <Pill tone="amber">{a.submitted} to grade</Pill>}
                    <span className="shrink-0 text-[11px] text-txt3">
                      {a.reviewed + a.submitted}/{a.total} in
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}
