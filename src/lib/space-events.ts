import "server-only";

import { db } from "@/lib/db";
import { reportError } from "@/lib/observability";

/**
 * Space activity feed writes. Fire-and-forget by design: an event is never
 * worth failing the action it describes, so callers don't await failures —
 * call `void recordSpaceEvent(...)` after the action commits.
 */

export type SpaceEventAction =
  | "joined"
  | "left"
  | "shared"
  | "unshared"
  | "pushed"
  | "forked"
  | "task_added"
  | "task_done";

export async function recordSpaceEvent(event: {
  spaceId: string;
  userId: string | null;
  actorName: string;
  action: SpaceEventAction;
  target: string;
  targetId?: string | null;
}): Promise<void> {
  try {
    await db().spaceEvent.create({
      data: {
        spaceId: event.spaceId,
        userId: event.userId,
        actorName: event.actorName.slice(0, 80),
        action: event.action,
        target: event.target.slice(0, 120),
        targetId: event.targetId ?? null,
      },
    });
  } catch (e) {
    reportError(e, { at: "space-events.write", spaceId: event.spaceId, action: event.action });
  }
}

/** Display name for the feed, from whatever identity fields are at hand. */
export function actorNameOf(user: { name?: string | null; email?: string | null }): string {
  return user.name ?? user.email ?? "someone";
}
