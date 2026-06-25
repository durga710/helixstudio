"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, Plus, Compass, BookOpen } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PostCard } from "@/components/community/post-card";
import { PublishModal } from "@/components/community/publish-modal";
import type { PostCard as PostCardData } from "@/lib/community";

type TypeFilter = "all" | "app" | "video";
type Sort = "popular" | "recent";

export function CommunityGallery() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      const mine = ++reqId.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ sort, page: String(nextPage) });
        if (q.trim()) params.set("q", q.trim());
        if (type !== "all") params.set("type", type);
        const res = await fetch(`/api/community?${params}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (mine !== reqId.current) return; // a newer query superseded this one
        if (res.ok && json?.ok) {
          const rows = json.data.posts as PostCardData[];
          setPosts((prev) => (replace ? rows : [...prev, ...rows]));
          setHasMore(Boolean(json.data.hasMore));
          setPage(nextPage);
        }
      } catch {
        /* keep what's shown */
      } finally {
        if (mine === reqId.current) setLoading(false);
      }
    },
    [q, type, sort],
  );

  // Reset to page 0 whenever the query/filter/sort changes (debounced for text).
  useEffect(() => {
    const t = setTimeout(() => void load(0, true), 250);
    return () => clearTimeout(t);
  }, [q, type, sort, load]);

  function patchPost(id: string, patch: Partial<PostCardData>) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function onLike(id: string) {
    const cur = posts.find((p) => p.id === id);
    if (!cur) return;
    // Optimistic; reconcile from the server response.
    patchPost(id, { likedByViewer: !cur.likedByViewer, likeCount: cur.likeCount + (cur.likedByViewer ? -1 : 1) });
    try {
      const res = await fetch(`/api/community/${id}/like`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) patchPost(id, { likedByViewer: json.data.liked, likeCount: json.data.likeCount });
    } catch {
      patchPost(id, { likedByViewer: cur.likedByViewer, likeCount: cur.likeCount });
    }
  }

  async function onFork(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/community/${id}/fork`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        router.push(`/editor/${json.data.workspaceId}`);
        return;
      }
    } catch {
      /* fall through */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-card-lg border border-border2 bg-panel lit">
        <div className="aurora-bg" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <div className="text-eyebrow flex items-center gap-1.5 text-accent">
              <Compass className="h-3.5 w-3.5" /> Community
            </div>
            <h1 className="text-h1 mt-1.5 brand-gradient-text">Discover what the community built</h1>
            <p className="mt-1.5 text-sm text-txt2">Open, like, and fork projects to make them yours.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/community/learn"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border2 bg-panel px-3 py-2 text-[13px] font-medium text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <BookOpen className="h-4 w-4 text-accent" /> Learn to make videos
            </Link>
            <Button variant="glow" onClick={() => setPublishOpen(true)}>
              <Plus className="h-4 w-4" /> Publish a project
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-lg border border-border2 bg-panel py-2 pl-9 pr-3 text-sm text-txt outline-none placeholder:text-txt3 focus:border-accent"
          />
        </div>
        <Segmented<TypeFilter>
          options={[
            { value: "all", label: "All" },
            { value: "app", label: "Apps" },
            { value: "video", label: "Videos" },
          ]}
          value={type}
          onChange={setType}
          aria-label="Filter by type"
        />
        <Segmented<Sort>
          options={[
            { value: "popular", label: "Popular" },
            { value: "recent", label: "Recent" },
          ]}
          value={sort}
          onChange={setSort}
          aria-label="Sort"
        />
      </div>

      {posts.length === 0 && !loading ? (
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title={`No projects yet${q || type !== "all" ? " for this filter" : ""}.`}
          description="Be the first — publish one of your projects for the community to discover."
          action={
            <Button variant="glow" onClick={() => setPublishOpen(true)}>
              <Plus className="h-4 w-4" /> Publish a project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((p, i) => (
            <div key={p.id} className="rise" style={{ animationDelay: `${i * 55}ms` }}>
              <PostCard post={p} onLike={onLike} onFork={onFork} busy={busyId === p.id} />
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6 text-txt3">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {hasMore && !loading && (
        <div className="flex justify-center pt-1">
          <Button variant="ghost" onClick={() => void load(page + 1, false)}>
            Load more
          </Button>
        </div>
      )}

      {publishOpen && (
        <PublishModal
          onClose={(published) => {
            setPublishOpen(false);
            if (published) void load(0, true);
          }}
        />
      )}
    </div>
  );
}
