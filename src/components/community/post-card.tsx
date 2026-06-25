"use client";

import Link from "next/link";
import { Heart, GitFork, Eye, Play, AppWindow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { PostCard as PostCardData } from "@/lib/community";

/** One project card in the community gallery. The thumbnail/title link to the
 * detail page; the footer buttons (like/fork) act in place. */
export function PostCard({
  post,
  onLike,
  onFork,
  busy,
}: {
  post: PostCardData;
  onLike: (id: string) => void;
  onFork: (id: string) => void;
  busy: boolean;
}) {
  const isVideo = post.kind === "video";
  return (
    <Card variant="interactive" className="flex flex-col overflow-hidden">
      <Link href={`/community/${post.id}`} className="group block">
        <div className="relative aspect-video w-full overflow-hidden bg-panel2">
          {post.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external poster (YouTube), no optimization needed
            <img src={post.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
          ) : (
            <div className="grid h-full w-full place-items-center text-txt3">
              {isVideo ? <Play className="h-9 w-9" /> : <AppWindow className="h-9 w-9" />}
            </div>
          )}
          <div className="absolute left-2 top-2">
            <Pill tone={isVideo ? "accent" : "neutral"}>
              {isVideo ? <Play className="h-3 w-3" /> : <AppWindow className="h-3 w-3" />}
              {isVideo ? "Video" : "App"}
            </Pill>
          </div>
        </div>
        <div className="px-3.5 pt-3">
          <h3 className="line-clamp-1 text-[14px] font-semibold text-txt group-hover:text-accent">{post.title}</h3>
          {post.description && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-txt3">{post.description}</p>}
          <p className="mt-1.5 text-[11.5px] text-txt3">by {post.authorName}</p>
        </div>
      </Link>

      <div className="mt-auto flex items-center gap-1 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onLike(post.id)}
          disabled={busy}
          aria-pressed={post.likedByViewer}
          aria-label={post.likedByViewer ? "Unlike" : "Like"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] transition-colors disabled:opacity-50",
            post.likedByViewer ? "text-accent" : "text-txt3 hover:text-txt",
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", post.likedByViewer && "fill-current")} />
          {post.likeCount}
        </button>
        {!isVideo && (
          <button
            type="button"
            onClick={() => onFork(post.id)}
            disabled={busy}
            aria-label="Fork this project"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-txt3 transition-colors hover:text-txt disabled:opacity-50"
          >
            <GitFork className="h-3.5 w-3.5" />
            {post.forkCount}
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-txt3">
          <Eye className="h-3.5 w-3.5" />
          {post.viewCount}
        </span>
      </div>
    </Card>
  );
}
