"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Users, Check, Loader2, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpaceOption {
  id: string;
  name: string;
  memberCount: number;
}

/**
 * Owner-only "Share" control for a workspace: drop a workspace into one of
 * the user's Spaces (everyone in it can then view/open/copy it) or make it
 * private again. The current share target is passed in by the workspace panel
 * (its spaceId), and re-derived after each change by reloading.
 */
export function ShareMenu({
  workspaceId,
  currentSpaceId,
  onChanged,
}: {
  workspaceId: string;
  currentSpaceId?: string | null;
  onChanged?: (spaceId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [spaces, setSpaces] = useState<SpaceOption[] | null>(null);
  const [current, setCurrent] = useState<string | null>(currentSpaceId ?? null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load the user's spaces the first time the menu opens.
  useEffect(() => {
    if (!open || spaces !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/spaces", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) {
          setSpaces(
            (json.data.spaces as { id: string; name: string; memberCount: number }[]).map((s) => ({
              id: s.id,
              name: s.name,
              memberCount: s.memberCount,
            })),
          );
        } else if (!cancelled) {
          setSpaces([]);
        }
      } catch {
        if (!cancelled) setSpaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, spaces]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function setShare(spaceId: string | null) {
    if (busy || spaceId === current) {
      if (spaceId === current) setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setCurrent(spaceId);
        onChanged?.(spaceId);
        setOpen(false);
      }
    } catch {
      // leave open so the user can retry
    }
    setBusy(false);
  }

  const sharedName = current ? spaces?.find((s) => s.id === current)?.name ?? null : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Add this workspace to a Space"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
          current
            ? "border-accent/50 bg-hl text-accent"
            : "border-border2 bg-panel text-txt2 hover:border-accent hover:text-txt",
        )}
      >
        <Users className="h-3.5 w-3.5" />
        {current ? "In Space" : "Add to Space"}
      </button>

      {open && (
        <div className="fade-up absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-card border border-border2 bg-panel shadow-pop">
          <div className="border-b border-border px-3 py-2">
            <span className="label-tactical">Add to a Space</span>
            {current && sharedName && (
              <p className="mt-1 text-[11px] text-txt3">
                Shared to <span className="text-txt2">{sharedName}</span>
              </p>
            )}
          </div>

          {spaces === null ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-txt3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading spaces…
            </div>
          ) : spaces.length === 0 ? (
            <div className="px-3 py-4 text-xs text-txt3">
              You&apos;re not in any spaces yet.{" "}
              <Link href="/space" className="text-accent underline underline-offset-2 hover:brightness-110">
                Create a Space first
              </Link>
              .
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto p-1">
              {spaces.map((s) => {
                const active = current === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setShare(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors disabled:opacity-60",
                        active ? "bg-hl text-txt" : "text-txt2 hover:bg-panel2 hover:text-txt",
                      )}
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0 text-txt3" />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 text-[10px] text-txt3">{s.memberCount}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {current && (
            <div className="border-t border-border p-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void setShare(null)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-txt2 transition-colors hover:bg-panel2 hover:text-txt disabled:opacity-60"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 text-txt3" />
                Make private
                {busy && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
