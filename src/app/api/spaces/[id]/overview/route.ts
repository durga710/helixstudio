/**
 * /api/spaces/[id]/overview — GET: the instructor command-center summary for
 * a classroom: what needs grading, what's due soon, completion and average
 * grade, and a per-assignment breakdown. Instructor (space owner) only.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Parse a free-text grade into a percent, or null if it isn't numeric.
 *  "92/100" → 92, "45/50" → 90, "88" → 88, "A-" → null. */
function gradeToPercent(grade: string | null): number | null {
  if (!grade) return null;
  const frac = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(grade);
  if (frac) {
    const denom = parseFloat(frac[2]);
    return denom > 0 ? (parseFloat(frac[1]) / denom) * 100 : null;
  }
  const num = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(grade);
  return num ? parseFloat(num[1]) : null;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guard("space.overview", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const space = await db().space.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, ownerId: true },
  });
  if (!space || space.ownerId !== g.user.id || space.kind !== "classroom") {
    return apiErrors.notFound("Classroom");
  }

  const [studentCount, assignments, submissions] = await Promise.all([
    db().spaceMember.count({ where: { spaceId: id, NOT: { userId: space.ownerId } } }),
    db().assignment.findMany({
      where: { spaceId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, dueAt: true },
    }),
    db().assignmentSubmission.findMany({
      where: { assignment: { spaceId: id } },
      select: { assignmentId: true, status: true, grade: true },
    }),
  ]);

  const now = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const byAssignment = new Map<string, typeof submissions>();
  for (const s of submissions) {
    const list = byAssignment.get(s.assignmentId) ?? [];
    list.push(s);
    byAssignment.set(s.assignmentId, list);
  }

  let needsGrading = 0;
  let turnedIn = 0; // submitted or reviewed → counts toward completion
  const gradePercents: number[] = [];

  const perAssignment = assignments.map((a) => {
    const subs = byAssignment.get(a.id) ?? [];
    const counts = { submitted: 0, reviewed: 0, in_progress: 0, revise: 0 };
    for (const s of subs) {
      if (s.status === "submitted") counts.submitted++;
      else if (s.status === "reviewed") {
        counts.reviewed++;
        const p = gradeToPercent(s.grade);
        if (p !== null) gradePercents.push(p);
      } else if (s.status === "in_progress") counts.in_progress++;
      else if (s.status === "revise") counts.revise++;
    }
    needsGrading += counts.submitted;
    turnedIn += counts.submitted + counts.reviewed;
    const dueMs = a.dueAt ? new Date(a.dueAt).getTime() : null;
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
      dueState: dueMs === null ? "none" : dueMs < now ? "overdue" : dueMs - now < WEEK ? "soon" : "later",
      total: studentCount,
      ...counts,
      notStarted: Math.max(0, studentCount - subs.length),
    };
  });

  const totalExpected = studentCount * assignments.length;
  const completionPct = totalExpected > 0 ? Math.round((turnedIn / totalExpected) * 100) : null;
  const avgGrade = gradePercents.length
    ? Math.round((gradePercents.reduce((a, b) => a + b, 0) / gradePercents.length) * 10) / 10
    : null;

  return ok({
    spaceId: space.id,
    spaceName: space.name,
    studentCount,
    assignmentCount: assignments.length,
    needsGrading,
    dueSoon: perAssignment.filter((a) => a.dueState === "soon").length,
    overdue: perAssignment.filter((a) => a.dueState === "overdue").length,
    completionPct,
    avgGrade,
    perAssignment,
  });
}
