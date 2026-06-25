import "server-only";

/**
 * Community service — the data layer behind the /community gallery. A
 * CommunityPost is a published project: kind="app" references a Workspace (its
 * files are forkable), kind="video" carries a normalized embed URL. Popularity
 * counters (like/fork/view) are denormalized on the post for cheap sorting;
 * CommunityLike is only the per-user toggle. All callers are authenticated
 * (the routes guard) — these functions take the resolved userId.
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getWorkspaceForUser, getWorkspaceForViewer, copyWorkspaceAsScratch } from "@/lib/workspace";
import { normalizeEmbed } from "@/lib/embed";
import { forkVideoProject } from "@/lib/video-project";

export interface RecipeShot {
  title: string;
  prompt: string;
  seconds: number;
}

/** Coerce a stored shot list into a bounded recipe for public display. */
function recipeShots(input: unknown): RecipeShot[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 30).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      title: String(o.title ?? "").slice(0, 200),
      prompt: String(o.prompt ?? "").slice(0, 4000),
      seconds: Math.max(1, Math.min(60, Math.round(Number(o.seconds)) || 8)),
    };
  });
}

export type PostKind = "app" | "video";
export type PostSort = "popular" | "recent";

const TITLE_MAX = 120;
const DESC_MAX = 2000;
const PAGE = 24;

export interface PostCard {
  id: string;
  kind: PostKind;
  title: string;
  description: string;
  authorName: string;
  likeCount: number;
  forkCount: number;
  viewCount: number;
  createdAt: string;
  embedProvider: string | null;
  thumbnailUrl: string | null;
  likedByViewer: boolean;
  /** A video post that links a reel and allows remixing. */
  remixable: boolean;
}

export interface PostDetail extends PostCard {
  embedUrl: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  isAuthor: boolean;
  // Video sharing: the creator's "editing space". `recipe` is present only when
  // the post links a saved reel AND the creator opted to reveal it. `canRemix`
  // means a viewer can fork that reel into their own editor.
  recipe: { idea: string; transcript: string; shots: RecipeShot[] } | null;
  canRemix: boolean;
}

type AuthorSel = { name: string | null; email: string | null } | null;

function authorName(u: AuthorSel): string {
  return u?.name?.trim() || u?.email?.split("@")[0] || "Someone";
}

/** YouTube poster from the canonical embed URL; null for other providers. */
function thumbFor(kind: string, embedUrl: string | null, provider: string | null): string | null {
  if (kind !== "video" || !embedUrl) return null;
  if (provider === "youtube") {
    const m = embedUrl.match(/\/embed\/([\w-]{11})/);
    return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
  }
  return null;
}

type PostRow = {
  id: string;
  kind: string;
  title: string;
  description: string;
  likeCount: number;
  forkCount: number;
  viewCount: number;
  createdAt: Date;
  embedUrl: string | null;
  embedProvider: string | null;
  allowRemix: boolean;
  videoProjectId: string | null;
  author: AuthorSel;
};

function toCard(r: PostRow, liked: boolean): PostCard {
  return {
    id: r.id,
    kind: r.kind === "video" ? "video" : "app",
    title: r.title,
    description: r.description,
    authorName: authorName(r.author),
    likeCount: r.likeCount,
    forkCount: r.forkCount,
    viewCount: r.viewCount,
    createdAt: r.createdAt.toISOString(),
    embedProvider: r.embedProvider,
    thumbnailUrl: thumbFor(r.kind, r.embedUrl, r.embedProvider),
    likedByViewer: liked,
    remixable: Boolean(r.allowRemix && r.videoProjectId),
  };
}

/* ----------------------------- publish ----------------------------- */

export async function publishApp(
  userId: string,
  workspaceId: string,
  opts: { title?: string; description?: string },
): Promise<{ id: string } | { error: string }> {
  const ws = await getWorkspaceForUser(workspaceId, userId);
  if (!ws) return { error: "Workspace not found." };
  if (ws.kind === "game") return { error: "Games can't be published to the community yet." };
  const title = (opts.title ?? "").trim().slice(0, TITLE_MAX) || ws.name;
  const description = (opts.description ?? "").trim().slice(0, DESC_MAX);

  // One post per workspace — republish just updates the title/description.
  const existing = await db().communityPost.findFirst({
    where: { workspaceId, kind: "app", hidden: false },
    select: { id: true },
  });
  if (existing) {
    await db().communityPost.update({ where: { id: existing.id }, data: { title, description } });
    return { id: existing.id };
  }
  const post = await db().communityPost.create({
    data: { authorId: userId, kind: "app", workspaceId, title, description },
    select: { id: true },
  });
  return { id: post.id };
}

export async function publishVideo(
  userId: string,
  opts: {
    embedUrl: string;
    title?: string;
    description?: string;
    // Optionally attach a saved reel (the "editing space") so viewers can see
    // the transcript/recipe (revealRecipe) and remix it (allowRemix).
    videoProjectId?: string;
    revealRecipe?: boolean;
    allowRemix?: boolean;
  },
): Promise<{ id: string } | { error: string }> {
  const norm = normalizeEmbed(opts.embedUrl);
  if (!norm) return { error: "Paste a valid YouTube, Vimeo, or Loom link." };
  const title = (opts.title ?? "").trim().slice(0, TITLE_MAX);
  if (!title) return { error: "A title is required." };
  const description = (opts.description ?? "").trim().slice(0, DESC_MAX);

  // Only link a reel the caller actually owns; the recipe/remix toggles mean
  // nothing without a linked project, so force them off in that case.
  let videoProjectId: string | null = null;
  if (opts.videoProjectId) {
    const owned = await db().videoProject.findFirst({
      where: { id: opts.videoProjectId, userId },
      select: { id: true },
    });
    if (!owned) return { error: "That saved reel wasn't found." };
    videoProjectId = owned.id;
  }
  const revealRecipe = videoProjectId ? Boolean(opts.revealRecipe) : false;
  const allowRemix = videoProjectId ? Boolean(opts.allowRemix) : false;

  const post = await db().communityPost.create({
    data: {
      authorId: userId,
      kind: "video",
      embedUrl: norm.embedUrl,
      embedProvider: norm.provider,
      title,
      description,
      videoProjectId,
      revealRecipe,
      allowRemix,
    },
    select: { id: true },
  });
  return { id: post.id };
}

export async function unpublish(userId: string, postId: string): Promise<{ ok: true } | { error: string }> {
  const post = await db().communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!post || post.authorId !== userId) return { error: "Post not found." };
  await db().communityPost.delete({ where: { id: postId } });
  return { ok: true };
}

/* ------------------------------ read ------------------------------- */

const ROW_SELECT = {
  id: true,
  kind: true,
  title: true,
  description: true,
  likeCount: true,
  forkCount: true,
  viewCount: true,
  createdAt: true,
  embedUrl: true,
  embedProvider: true,
  allowRemix: true,
  videoProjectId: true,
  author: { select: { name: true, email: true } },
} as const;

export async function listPosts(opts: {
  q?: string;
  type?: string;
  sort?: string;
  page?: number;
  viewerId?: string | null;
}): Promise<{ posts: PostCard[]; hasMore: boolean }> {
  const page = Math.max(0, opts.page ?? 0);
  const where: Prisma.CommunityPostWhereInput = { hidden: false };
  if (opts.type === "app" || opts.type === "video") where.kind = opts.type;
  const q = opts.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  const orderBy: Prisma.CommunityPostOrderByWithRelationInput[] =
    opts.sort === "popular" ? [{ likeCount: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];

  const rows = await db().communityPost.findMany({
    where,
    orderBy,
    skip: page * PAGE,
    take: PAGE + 1,
    select: ROW_SELECT,
  });
  const hasMore = rows.length > PAGE;
  const slice = rows.slice(0, PAGE);

  let liked = new Set<string>();
  if (opts.viewerId && slice.length) {
    const likes = await db().communityLike.findMany({
      where: { userId: opts.viewerId, postId: { in: slice.map((r) => r.id) } },
      select: { postId: true },
    });
    liked = new Set(likes.map((l) => l.postId));
  }
  return { posts: slice.map((r) => toCard(r, liked.has(r.id))), hasMore };
}

export async function getPostDetail(postId: string, viewerId: string | null): Promise<PostDetail | null> {
  const post = await db().communityPost.findFirst({
    where: { id: postId, hidden: false },
    select: {
      ...ROW_SELECT,
      authorId: true,
      embedUrl: true,
      workspaceId: true,
      workspace: { select: { name: true } },
      videoProjectId: true,
      revealRecipe: true,
      allowRemix: true,
      videoProject: { select: { idea: true, transcript: true, shots: true } },
    },
  });
  if (!post) return null;
  let liked = false;
  if (viewerId) {
    liked = Boolean(
      await db().communityLike.findUnique({
        where: { postId_userId: { postId, userId: viewerId } },
        select: { id: true },
      }),
    );
  }
  const hasProject = Boolean(post.videoProjectId && post.videoProject);
  const recipe =
    post.revealRecipe && post.videoProject
      ? {
          idea: post.videoProject.idea,
          transcript: post.videoProject.transcript,
          shots: recipeShots(post.videoProject.shots),
        }
      : null;
  return {
    ...toCard(post, liked),
    embedUrl: post.kind === "video" ? post.embedUrl : null,
    workspaceId: post.workspaceId,
    workspaceName: post.workspace?.name ?? null,
    isAuthor: viewerId != null && post.authorId === viewerId,
    recipe,
    canRemix: Boolean(post.allowRemix && hasProject),
  };
}

/** Remix a shared video's reel into a fresh project the caller owns. Requires
 * the post to be a video with allowRemix and a linked reel. */
export async function remixVideoPost(
  userId: string,
  postId: string,
): Promise<{ projectId: string } | { error: string }> {
  const post = await db().communityPost.findFirst({
    where: { id: postId, hidden: false },
    select: { kind: true, allowRemix: true, videoProjectId: true },
  });
  if (!post) return { error: "Post not found." };
  if (post.kind !== "video" || !post.allowRemix || !post.videoProjectId) {
    return { error: "This video can't be remixed." };
  }
  const forked = await forkVideoProject(post.videoProjectId, userId);
  if ("error" in forked) return forked;
  await db().communityPost.update({ where: { id: postId }, data: { forkCount: { increment: 1 } } });
  return { projectId: forked.id };
}

/* --------------------------- interactions -------------------------- */

export async function toggleLike(
  userId: string,
  postId: string,
): Promise<{ liked: boolean; likeCount: number } | { error: string }> {
  const post = await db().communityPost.findFirst({ where: { id: postId, hidden: false }, select: { id: true } });
  if (!post) return { error: "Post not found." };
  const existing = await db().communityLike.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true },
  });
  try {
    if (existing) {
      const [, updated] = await db().$transaction([
        db().communityLike.delete({ where: { id: existing.id } }),
        db().communityPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } }),
      ]);
      return { liked: false, likeCount: updated.likeCount };
    }
    const [, updated] = await db().$transaction([
      db().communityLike.create({ data: { postId, userId } }),
      db().communityPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } }),
    ]);
    return { liked: true, likeCount: updated.likeCount };
  } catch {
    // A concurrent double-click can race the unique — report the settled state.
    const fresh = await db().communityPost.findUnique({ where: { id: postId }, select: { likeCount: true } });
    return { liked: !existing, likeCount: fresh?.likeCount ?? 0 };
  }
}

/** Best-effort view increment (the route debounces per viewer). */
export async function recordView(postId: string): Promise<void> {
  await db().communityPost.updateMany({ where: { id: postId, hidden: false }, data: { viewCount: { increment: 1 } } });
}

export async function forkPost(
  userId: string,
  postId: string,
): Promise<{ workspaceId: string } | { error: string }> {
  const post = await db().communityPost.findFirst({
    where: { id: postId, hidden: false },
    select: { kind: true, workspaceId: true },
  });
  if (!post) return { error: "Post not found." };
  if (post.kind !== "app" || !post.workspaceId) return { error: "Only app projects can be forked." };
  const v = await getWorkspaceForViewer(post.workspaceId, userId);
  if (!v) return { error: "This project isn't available to fork." };
  const fork = await copyWorkspaceAsScratch(v.ws, userId, `Copy of ${v.ws.name}`);
  await db().communityPost.update({ where: { id: postId }, data: { forkCount: { increment: 1 } } });
  return { workspaceId: fork.id };
}
