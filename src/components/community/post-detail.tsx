"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, GitFork, Eye, ArrowLeft, ExternalLink, Loader2, Trash2, Play, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { PostDetail } from "@/lib/community";

export function PostDetailView({ post }: { post: PostDetail }) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.likedByViewer);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [forkCount] = useState(post.forkCount);
  const [busy, setBusy] = useState<null | "fork" | "delete">(null);
  const isVideo = post.kind === "video";

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
        </div>
      </div>

      {/* Stats */}
      <div className="mt-3 flex items-center gap-4 text-[12.5px] text-txt3">
        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {likeCount} likes</span>
        {!isVideo && <span className="inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" /> {forkCount} forks</span>}
        <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {post.viewCount} views</span>
      </div>

      {post.description && <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-txt2">{post.description}</p>}

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
