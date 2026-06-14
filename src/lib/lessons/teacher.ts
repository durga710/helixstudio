import "server-only";

/** Teacher helpers for the lesson library. A "teacher" owns ≥1 classroom Space;
 * only teachers may browse the public library. Author names come from a
 * separate User lookup (the Lesson table is FK-less). */

import { db, dbEnabled } from "@/lib/db";

export async function isTeacher(userId: string): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const count = await db().space.count({ where: { ownerId: userId, kind: "classroom" } });
    return count > 0;
  } catch {
    return false;
  }
}

/** Map author userIds → a friendly display name ("by …"). */
export async function authorNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!dbEnabled() || unique.length === 0) return {};
  try {
    const users = await db().user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
    return Object.fromEntries(
      users.map((u) => [u.id, u.name?.trim() || (u.email ? u.email.split("@")[0] : "a teacher")]),
    );
  } catch {
    return {};
  }
}
