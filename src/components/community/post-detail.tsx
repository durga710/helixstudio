"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, GitFork, Eye, ArrowLeft, ExternalLink, Loader2, Trash2, Play, AppWindow, Clapperboard, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { PostDetail } from "@/lib/community";

export function PostDetailView({ post }: { post: PostDetail }) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.likedByViewer);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [forkCount] = useState(post.forkCount);
  const [busy, setBusy] = useState<null | "fork" | "delete" | "remix">(null);
  const isVideo = post.kind === "video";

  async function remix() {
    setBusy("remix");
    try {
      const res = await fetch(`/api/community/${post.id}/remix`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        router.push(`/video/editor?project=${json.data.projectId}`);
        return;
      }
    } catch {
      /* ignore */
    }
    setBusy(null);
  }

  async function like() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/community/${post.id}/like`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setLiked(json.data.liked);
        setLikeCount(json.data.likeCount);
      }
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  async function fork() {
    setBusy("fork");
    try {
      const res = await fetch(`/api/community/${post.id}/fork`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        router.push(`/editor/${json.data.workspaceId}`);
        return;
      }
    } catch {
      /* ignore */
    }
    setBusy(null);
  }

  async function unpublish() {
    setBusy("delete");
    try {
      const res = await fetch(`/api/community/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/community");
        return;
      }
    } catch {
      /* ignore */
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-[860px]">
      <Link href="/community" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-txt3 transition-colors hover:text-txt">
        <ArrowLeft className="h-4 w-4" /> Community
      </Link>

      {/* Media */}
      <div className="overflow-hidden rounded-card-lg border border-border2 bg-panel2 lit">
        {isVideo && post.embedUrl ? (
          <div className="aspect-video w-full">
            <iframe
              src={post.embedUrl}
              title={post.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external poster
          <img src={post.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="grid aspect-video w-full place-items-center text-txt3">
            {isVideo ? <Play className="h-10 w-10" /> : <AppWindow className="h-10 w-10" />}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <Pill tone={isVideo ? "accent" : "neutral"}>{isVideo ? "Video" : "App"}</Pill>
            <span className="text-[12.5px] text-txt3">by {post.authorName}</span>
          </div>
          <h1 className="text-h1">{post.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void like()}
            aria-pressed={liked}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] transition-colors",
              liked ? "border-accent/50 bg-hl text-accent" : "border-border2 text-txt2 hover:text-txt",
            )}
          >
            <Heart className={cn("h-4 w-4", liked && "fill-current")} /> {likeCount}
          </button>
          {!isVideo && (
            <Button onClick={() => void fork()} disabled={busy === "fork"}>
              {busy === "fork" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitFork className="h-4 w-4" />} Fork
            </Button>
          )}
          {isVideo && post.canRemix && (
            <Button variant="glow" onClick={() => void remix()} disabled={busy === "remix"}>
              {busy === "remix" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Remix
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-3 flex items-center gap-4 text-[12.5px] text-txt3">
        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {likeCount} likes</span>
        {!isVideo && <span className="inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" /> {forkCount} forks</span>}
        <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {post.viewCount} views</span>
      </div>

      {post.description && <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-txt2">{post.description}</p>}

      {/* The creator's editing space — shown only when they opted to reveal it. */}
      {post.recipe && (
        <div className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-accent" />
            <h2 className="text-h2">How it was made</h2>
            {post.canRemix && <Pill tone="accent">Remixable</Pill>}
          </div>

          {post.recipe.idea && (
            <div className="lit mb-3 rounded-card border border-border bg-panel p-4">
              <div className="text-eyebrow mb-1.5">The idea</div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-txt2">{post.recipe.idea}</p>
            </div>
          )}

          {post.recipe.transcript && (
            <div className="lit mb-3 rounded-card border border-border bg-panel p-4">
              <div className="text-eyebrow mb-1.5">Transcript</div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-txt2">{post.recipe.transcript}</p>
            </div>
          )}

          {post.recipe.shots.length > 0 && (
            <div>
              <div className="text-eyebrow mb-2">Shot list · {post.recipe.shots.length}</div>
              <ol className="space-y-2">
                {post.recipe.shots.map((s, i) => (
                  <li key={i} className="lit rounded-card border border-border bg-panel p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-panel2 font-mono text-[10.5px] text-txt3">
                        {i + 1}
                      </span>
                      <span className="truncate text-[13px] font-semibold text-txt">{s.title || `Shot ${i + 1}`}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10.5px] text-txt3">{s.seconds}s</span>
                    </div>
                    {s.prompt && (
                      <p className="whitespace-pre-wrap pl-7 text-[12.5px] leading-relaxed text-txt3">{s.prompt}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {post.canRemix && (
            <div className="mt-4">
              <Button variant="glow" onClick={() => void remix()} disabled={busy === "remix"}>
                {busy === "remix" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Remix into
                my editor
              </Button>
              <p className="mt-1.5 text-[11px] text-txt3">
                Forks this reel — idea, transcript &amp; shot prompts — into your own editor to tweak and regenerate.
              </p>
            </div>
          )}
        </div>
      )}

      {!isVideo && post.workspaceId && (
        <div className="mt-5">
          <Link
            href={`/editor/${post.workspaceId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border2 px-3 py-2 text-[13px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <ExternalLink className="h-4 w-4" /> Open read-only
          </Link>
        </div>
      )}

      {post.isAuthor && (
        <div className="mt-8 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => void unpublish()}
            disabled={busy === "delete"}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-txt3 transition-colors hover:text-bad disabled:opacity-50"
          >
            {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Unpublish
          </button>
        </div>
      )}
    </div>
  );
}
