import "server-only";

/**
 * Space contribution insights — per-member activity aggregated from data the app
 * already records (space events, AI usage, shared workspaces, submissions). It's
 * a balanced *visibility* view, not a productivity scoreboard: no single
 * rankable "score", no lines-of-code. Everything is read-only aggregation.
 */

import { db } from "@/lib/db";

export interface MemberStat {
  userId: string;
  name: string;
  image: string | null;
  role: string;
  pushes: number;
  aiBuilds: number;
  workspaces: number;
  /** ISO timestamp of the member's most recent activity, or null. */
  lastActive: string | null;
  /** Distinct days active in the last 7 (quiet "momentum", not a streak flame). */
  activeDays7: number;
  /** Submissions (classroom only). */
  submissions: number;
  /** No activity at all — surfaced as a subtle tag (esp. useful in classrooms). */
  quiet: boolean;
}

export interface SpaceInsights {
  kind: string;
  summary: { activeThisWeek: number; pushes: number; aiBuilds: number; workspaces: number };
  members: MemberStat[];
}

const DAY = 86_400_000;

export async function getSpaceInsights(spaceId: string): Promise<SpaceInsights> {
  const space = await db().space.findUnique({
    where: { id: spaceId },
    select: {
      kind: true,
      ownerId: true,
      members: {
        select: { userId: true, role: true, user: { select: { name: true, email: true, image: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!space) return { kind: "team", summary: { activeThisWeek: 0, pushes: 0, aiBuilds: 0, workspaces: 0 }, members: [] };

  const [events, workspaces] = await Promise.all([
    db().spaceEvent.findMany({
      where: { spaceId, createdAt: { gte: new Date(Date.now() - 90 * DAY) } },
      select: { userId: true, action: true, createdAt: true },
    }),
    db().workspace.findMany({ where: { spaceId }, select: { id: true, userId: true } }),
  ]);

  const wsIds = workspaces.map((w) => w.id);
  const [aiByUser, subsByUser] = await Promise.all([
    wsIds.length
      ? db().aiUsageEvent.groupBy({
          by: ["userId"],
          where: { kind: "chat", workspaceId: { in: wsIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
    space.kind === "classroom"
      ? db().assignmentSubmission.groupBy({
          by: ["userId"],
          where: { assignment: { spaceId }, status: { in: ["submitted", "reviewed"] } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { userId: string; _count: { _all: number } }[]),
  ]);

  const aiMap = new Map(aiByUser.map((r) => [r.userId, r._count._all]));
  const subMap = new Map(subsByUser.map((r) => [r.userId, r._count._all]));
  const wsMap = new Map<string, number>();
  for (const w of workspaces) wsMap.set(w.userId, (wsMap.get(w.userId) ?? 0) + 1);

  const weekAgo = Date.now() - 7 * DAY;
  let totalPushes = 0;
  const members: MemberStat[] = space.members.map((m) => {
    const mine = events.filter((e) => e.userId === m.userId);
    const pushes = mine.filter((e) => e.action === "pushed").length;
    totalPushes += pushes;
    const lastActive = mine.reduce<Date | null>((acc, e) => (!acc || e.createdAt > acc ? e.createdAt : acc), null);
    const days = new Set(
      mine.filter((e) => e.createdAt.getTime() >= weekAgo).map((e) => Math.floor(e.createdAt.getTime() / DAY)),
    );
    const aiBuilds = aiMap.get(m.userId) ?? 0;
    const submissions = subMap.get(m.userId) ?? 0;
    return {
      userId: m.userId,
      name: m.user.name ?? m.user.email ?? "member",
      image: m.user.image ?? null,
      role: m.role,
      pushes,
      aiBuilds,
      workspaces: wsMap.get(m.userId) ?? 0,
      lastActive: lastActive ? lastActive.toISOString() : null,
      activeDays7: days.size,
      submissions,
      quiet: mine.length === 0 && aiBuilds === 0 && submissions === 0,
    };
  });

  const totalAi = members.reduce((n, m) => n + m.aiBuilds, 0);
  const activeThisWeek = members.filter((m) => m.lastActive && new Date(m.lastActive).getTime() >= weekAgo).length;

  return {
    kind: space.kind,
    summary: { activeThisWeek, pushes: totalPushes, aiBuilds: totalAi, workspaces: wsIds.length },
    members,
  };
}
