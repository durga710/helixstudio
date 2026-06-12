"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

interface GradebookData {
  spaceName: string;
  assignments: { id: string; title: string; dueAt: string | null }[];
  students: { userId: string; name: string; image: string | null }[];
  cells: Record<string, { status: string; grade: string | null; submittedAt: string | null }>;
}

const CELL_STYLE: Record<string, string> = {
  not_started: "text-txt3",
  in_progress: "text-txt2",
  submitted: "text-accent",
  reviewed: "text-ok",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Instructor-only grid: every student × every assignment. */
export function GradebookScreen({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const [data, setData] = useState<GradebookData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/spaces/${spaceId}/gradebook`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) setData(json.data as GradebookData);
        else setError(json?.error?.message ?? "Couldn't load the gradebook.");
      } catch {
        if (!cancelled) setError("Couldn't load the gradebook.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  if (error) {
    return (
      <div className="pad-screen">
        <Card className="mx-auto mt-6 max-w-[760px] p-8 text-center text-sm text-bad">{error}</Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pad-screen">
        <div className="mx-auto grid min-h-[40vh] max-w-[1100px] place-items-center text-sm text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> loading…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1200px]">
        <button
          type="button"
          onClick={() => router.push(`/space?s=${spaceId}`)}
          className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-txt3 transition-colors hover:text-txt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {data.spaceName}
        </button>
        <div className="mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-txt3" />
          <h1 className="text-[20px] font-bold tracking-tight">Gradebook</h1>
          <span className="text-[12px] text-txt3">
            {data.students.length} student{data.students.length === 1 ? "" : "s"} ·{" "}
            {data.assignments.length} assignment{data.assignments.length === 1 ? "" : "s"}
          </span>
        </div>

        {data.assignments.length === 0 || data.students.length === 0 ? (
          <Card className="p-8 text-center text-sm text-txt3">
            {data.assignments.length === 0
              ? "No assignments yet — post one from the classroom page."
              : "No students yet — share the invite link from the classroom page."}
          </Card>
        ) : (
          <>
          {/* Mobile: one card per student (the wide grid is unreadable on
              narrow screens). Table view takes over at md+. */}
          <div className="space-y-3 md:hidden">
            {data.students.map((s) => {
              const reviewed = data.assignments.filter(
                (a) => data.cells[`${a.id}:${s.userId}`]?.status === "reviewed",
              ).length;
              return (
                <Card key={s.userId} className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-panel2 text-[10px] font-semibold text-txt2">
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(s.name)
                      )}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-txt">{s.name}</span>
                    <span className="font-mono text-[11px] text-txt3">
                      {reviewed}/{data.assignments.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {data.assignments.map((a) => {
                      const cell = data.cells[`${a.id}:${s.userId}`];
                      const status = cell?.status ?? "not_started";
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => router.push(`/space/assignments/${a.id}?s=${spaceId}`)}
                            className="min-w-0 flex-1 truncate text-left text-[12px] text-txt2 transition-colors hover:text-accent"
                          >
                            {a.title}
                          </button>
                          {cell?.grade && status === "reviewed" ? (
                            <Pill tone="green">{cell.grade}</Pill>
                          ) : (
                            <span className={cn("shrink-0 font-mono text-[11px]", CELL_STYLE[status])}>
                              {status.replace("_", " ")}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-panel px-4 py-3 text-left font-semibold text-txt">
                    Student
                  </th>
                  {data.assignments.map((a) => (
                    <th key={a.id} className="px-3 py-3 text-left font-medium text-txt2">
                      <button
                        type="button"
                        onClick={() => router.push(`/space/assignments/${a.id}?s=${spaceId}`)}
                        className="max-w-[160px] truncate text-left transition-colors hover:text-accent"
                        title={a.title}
                      >
                        {a.title}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-medium text-txt2">Done</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, rowIdx) => {
                  const reviewed = data.assignments.filter(
                    (a) => data.cells[`${a.id}:${s.userId}`]?.status === "reviewed",
                  ).length;
                  return (
                    <tr key={s.userId} className={rowIdx > 0 ? "border-t border-border" : ""}>
                      <td className="sticky left-0 z-10 bg-panel px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-panel2 text-[9.5px] font-semibold text-txt2">
                            {s.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              initials(s.name)
                            )}
                          </span>
                          <span className="max-w-[160px] truncate font-medium text-txt">{s.name}</span>
                        </span>
                      </td>
                      {data.assignments.map((a) => {
                        const cell = data.cells[`${a.id}:${s.userId}`];
                        const status = cell?.status ?? "not_started";
                        return (
                          <td key={a.id} className="px-3 py-2.5">
                            {cell?.grade && status === "reviewed" ? (
                              <Pill tone="green">{cell.grade}</Pill>
                            ) : (
                              <span className={cn("font-mono text-[11px]", CELL_STYLE[status])}>
                                {status.replace("_", " ")}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-txt3">
                        {reviewed}/{data.assignments.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          </>
        )}
      </div>
    </div>
  );
}
