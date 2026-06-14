"use client";

import { useEffect, useState } from "react";
import { readCache, writeCache } from "@/lib/client-cache";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  GitFork,
  Loader2,
  LogIn,
  LogOut,
  Send,
  Share2,
  Undo2,
  Upload,
  SquareCheckBig,
  SquarePlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface FeedEvent {
  id: string;
  action: string;
  actorName: string;
  target: string;
  targetId: string | null;
  createdAt: string;
}

const EVENT_META: Record<string, { icon: LucideIcon; text: (e: FeedEvent) => string }> = {
  joined: { icon: LogIn, text: (e) => `${e.actorName} joined` },
  left: { icon: LogOut, text: (e) => `${e.actorName} left` },
  shared: { icon: Share2, text: (e) => `${e.actorName} shared ${e.target}` },
  unshared: { icon: Share2, text: (e) => `${e.actorName} made ${e.target} private` },
  assignment_created: { icon: ClipboardList, text: (e) => `${e.actorName} posted assignment "${e.target}"` },
  submitted: { icon: Send, text: (e) => `${e.actorName} submitted "${e.target}"` },
  reviewed: { icon: CheckCircle2, text: (e) => `${e.actorName} reviewed a submission for "${e.target}"` },
  revision_requested: { icon: Undo2, text: (e) => `${e.actorName} requested a revision on "${e.target}"` },
  lesson_completed: { icon: CheckCircle2, text: (e) => `${e.actorName} finished the lesson "${e.target}"` },
  pushed: { icon: Upload, text: (e) => `${e.actorName} pushed ${e.target} to git` },
  forked: { icon: GitFork, text: (e) => `${e.actorName} copied ${e.target}` },
  task_added: { icon: SquarePlus, text: (e) => `${e.actorName} added task "${e.target}"` },
  task_done: { icon: SquareCheckBig, text: (e) => `${e.actorName} completed "${e.target}"` },
};

const COLLAPSED_COUNT = 8;

/** Recent activity inside a Space's detail panel. */
export function SpaceActivityFeed({ spaceId }: { spaceId: string }) {
  // Seeded from the last visit's cache — the feed paints on first render
  // and the effect below refreshes it in the background.
  const [events, setEvents] = useState<FeedEvent[] | null>(() =>
    readCache<FeedEvent[]>(`space:${spaceId}:activity`),
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache<FeedEvent[]>(`space:${spaceId}:activity`);
    (async () => {
      try {
        const res = await fetch(`/api/spaces/${spaceId}/activity`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setEvents(json.data.events as FeedEvent[]);
          writeCache(`space:${spaceId}:activity`, json.data.events);
        } else if (!cached) {
          setEvents([]);
        }
      } catch {
        if (!cancelled && !cached) setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  if (events !== null && events.length === 0) return null; // nothing yet — stay quiet

  const visible = expanded ? events ?? [] : (events ?? []).slice(0, COLLAPSED_COUNT);

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Activity className="h-4 w-4 text-txt3" /> Activity
      </h3>
      {events === null ? (
        <Card className="grid min-h-[56px] place-items-center p-3 text-xs text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </span>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {visible.map((e, i) => {
            const meta = EVENT_META[e.action] ?? { icon: Activity, text: (ev: FeedEvent) => `${ev.actorName} · ${ev.target}` };
            const Icon = meta.icon;
            return (
              <div
                key={e.id}
                className={`flex items-center gap-[11px] px-4 py-[10px] text-[12.5px] ${i > 0 ? "border-t border-border" : ""}`}
              >
                <span className="shrink-0 text-txt3">
                  <Icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1 truncate text-txt2">{meta.text(e)}</span>
                <span className="ml-auto whitespace-nowrap text-[11px] text-txt3">{timeAgo(e.createdAt)}</span>
              </div>
            );
          })}
          {events.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-border px-4 py-2 text-center text-[11.5px] text-txt3 transition-colors hover:text-txt"
            >
              {expanded ? "Show less" : `Show ${events.length - COLLAPSED_COUNT} more`}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
