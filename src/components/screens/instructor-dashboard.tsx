"use client";

import Link from "next/link";
import { ArrowLeft, GraduationCap, BookOpen, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ClassroomOverview } from "@/components/screens/classroom-overview";
import { AssignmentsSection } from "@/components/screens/assignments-section";
import { LessonBuilderPanel } from "@/components/lab/lesson-builder-panel";

/* The Instructor Dashboard: a clean home for everything a classroom teacher
 * manages — the AI Lesson Builder (new), class overview, assignments, and the
 * gradebook. Owner-only (gated by the page). */

export function InstructorDashboard({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const { toast } = useToast();

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[900px]">
        <Link
          href={`/space?s=${spaceId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-txt3 transition-colors hover:text-txt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to space
        </Link>

        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Instructor</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Instructor Dashboard</h1>
          <GraduationCap className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 text-[13px] text-txt2">
          Everything for <span className="text-txt">{spaceName}</span> — build lessons, hand out assignments, and track
          your class, all in one place.
        </p>

        <div className="mt-6 space-y-5">
          {/* AI Lesson Builder — the headline */}
          <LessonBuilderPanel spaceId={spaceId} />

          {/* Class at a glance */}
          <ClassroomOverview spaceId={spaceId} refreshKey={spaceId} />

          {/* Assignments (owner management view) */}
          <AssignmentsSection spaceId={spaceId} isOwner onUpgradeNeeded={(msg) => toast(msg)} />

          {/* Gradebook */}
          <Link href={`/space/gradebook?s=${spaceId}`} className="block">
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-accent">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-border2 bg-panel2">
                <BookOpen className="h-5 w-5 text-txt2" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-txt">Gradebook</span>
                <span className="block text-[12px] text-txt3">Grades and submissions across every assignment.</span>
              </span>
              <ArrowRight className="h-4 w-4 text-txt3" />
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
