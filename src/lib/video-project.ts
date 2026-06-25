import "server-only";

/**
 * VideoProject service — the data layer behind the long-form HelixVideo editor's
 * saved "editing space". A project stores the idea, the synthesized transcript,
 * the AI-authored shot list (the recipe), and render settings, so work survives
 * a refresh, can be resumed, and — when published to the community with
 * revealRecipe/allowRemix — be viewed and remixed by other users.
 *
 * All callers are authenticated (the routes guard); these take the resolved id.
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const TITLE_MAX = 120;
const IDEA_MAX = 4000;
const TRANSCRIPT_MAX = 20000;
const MAX_SHOTS = 30;

export interface Shot {
  title: string;
  prompt: string;
  seconds: number;
}

export interface VideoProjectDto {
  id: string;
  kind: string;
  title: string;
  idea: string;
  transcript: string;
  size: string;
  secondsEach: number;
  shots: Shot[];
  updatedAt: string;
  isOwner: boolean;
}

export interface SaveInput {
  id?: string;
  title?: string;
  idea?: string;
  transcript?: string;
  size?: string;
  secondsEach?: number;
  shots?: unknown;
}

/** Coerce arbitrary client/stored JSON into a bounded, well-typed shot list. */
function sanitizeShots(input: unknown): Shot[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_SHOTS).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      title: String(o.title ?? "").slice(0, 200),
      prompt: String(o.prompt ?? "").slice(0, 4000),
      seconds: Math.max(1, Math.min(60, Math.round(Number(o.seconds)) || 8)),
    };
  });
}

type ProjectRow = {
  id: string;
  kind: string;
  title: string;
  idea: string;
  transcript: string;
  size: string;
  secondsEach: number;
  shots: Prisma.JsonValue;
  updatedAt: Date;
};

function toDto(p: ProjectRow, isOwner: boolean): VideoProjectDto {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    idea: p.idea,
    transcript: p.transcript,
    size: p.size,
    secondsEach: p.secondsEach,
    shots: sanitizeShots(p.shots),
    updatedAt: p.updatedAt.toISOString(),
    isOwner,
  };
}

/** Create a new project, or update an existing one the user owns. */
export async function saveVideoProject(
  userId: string,
  input: SaveInput,
): Promise<{ id: string } | { error: string }> {
  const title = (input.title ?? "").trim().slice(0, TITLE_MAX) || "Untitled reel";
  const idea = (input.idea ?? "").slice(0, IDEA_MAX);
  const transcript = (input.transcript ?? "").slice(0, TRANSCRIPT_MAX);
  const size = (input.size ?? "1280x720").slice(0, 20);
  const secondsEach = Math.max(1, Math.min(60, Math.round(Number(input.secondsEach)) || 8));
  const shots = sanitizeShots(input.shots) as unknown as Prisma.InputJsonValue;

  if (input.id) {
    const owned = await db().videoProject.findFirst({
      where: { id: input.id, userId },
      select: { id: true },
    });
    if (!owned) return { error: "Project not found." };
    await db().videoProject.update({
      where: { id: input.id },
      data: { title, idea, transcript, size, secondsEach, shots },
    });
    return { id: input.id };
  }

  const created = await db().videoProject.create({
    data: { userId, kind: "reel", title, idea, transcript, size, secondsEach, shots },
    select: { id: true },
  });
  return { id: created.id };
}

/** The caller's saved projects, newest first (for the publish picker / library). */
export async function listVideoProjects(
  userId: string,
): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const rows = await db().videoProject.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

/** Load a project the user owns (editor resume). */
export async function loadVideoProject(id: string, userId: string): Promise<VideoProjectDto | null> {
  const p = await db().videoProject.findFirst({ where: { id, userId } });
  return p ? toDto(p, true) : null;
}

/** Load any project by id (community viewing — gating is the caller's job: only
 * call when a non-hidden post links it with revealRecipe). */
export async function getProjectById(id: string): Promise<VideoProjectDto | null> {
  const p = await db().videoProject.findUnique({ where: { id } });
  return p ? toDto(p, false) : null;
}

/** Copy a project into a fresh one owned by userId (community remix). */
export async function forkVideoProject(
  sourceId: string,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  const src = await db().videoProject.findUnique({ where: { id: sourceId } });
  if (!src) return { error: "Project not found." };
  const created = await db().videoProject.create({
    data: {
      userId,
      kind: src.kind,
      title: `Remix of ${src.title}`.slice(0, TITLE_MAX),
      idea: src.idea,
      transcript: src.transcript,
      size: src.size,
      secondsEach: src.secondsEach,
      shots: src.shots as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { id: created.id };
}
