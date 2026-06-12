/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount effect sets state from an async load */
"use client";

import { useCallback, useEffect, useState } from "react";
import { readCache, writeCache } from "@/lib/client-cache";
import { ChevronDown, ChevronLeft, ChevronRight, KanbanSquare, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export interface BoardMember {
  id: string;
  name: string;
}

interface BoardTask {
  id: string;
  title: string;
  note: string | null;
  status: "todo" | "doing" | "done";
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  createdAt: string;
}

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "done", label: "Done" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Per-Space task board. Drag cards between columns (native HTML5 DnD) or use
 * the ◀/▶ buttons — same PATCH either way, so keyboard users lose nothing.
 */
export function SpaceBoard({
  spaceId,
  members,
  youId,
  isOwner,
}: {
  spaceId: string;
  members: BoardMember[];
  youId: string | null;
  isOwner: boolean;
}) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<BoardTask[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColumnKey | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/tasks`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setTasks(json.data.tasks as BoardTask[]);
        writeCache(`space:${spaceId}:tasks`, json.data.tasks);
      } else {
        setTasks((prev) => prev ?? []);
      }
    } catch {
      setTasks((prev) => prev ?? []);
    }
  }, [spaceId]);

  useEffect(() => {
    // Instant paint from the last visit; load() refreshes in the background.
    const cached = readCache<BoardTask[]>(`space:${spaceId}:tasks`);
    if (cached) setTasks(cached);
    void load();
  }, [load, spaceId]);

  async function addTask() {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setNewTitle("");
        await load();
      } else {
        toast(json?.error?.message ?? "Couldn't add the task.");
      }
    } catch {
      toast("Couldn't add the task.");
    }
    setAdding(false);
  }

  async function patchTask(taskId: string, body: Record<string, unknown>) {
    // Optimistic status moves keep dragging snappy; reload reconciles.
    if (typeof body.status === "string") {
      setTasks((ts) =>
        (ts ?? []).map((t) => (t.id === taskId ? { ...t, status: body.status as ColumnKey } : t)),
      );
    }
    try {
      const res = await fetch(`/api/spaces/${spaceId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast("Couldn't update the task.");
        await load();
      }
    } catch {
      toast("Couldn't update the task.");
      await load();
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/tasks/${taskId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setTasks((ts) => (ts ?? []).filter((t) => t.id !== taskId));
      } else {
        toast(json?.error?.message ?? "Only the creator or the owner can delete a task.");
      }
    } catch {
      toast("Couldn't delete the task.");
    }
  }

  function moveBy(task: BoardTask, dir: -1 | 1) {
    const idx = COLUMNS.findIndex((c) => c.key === task.status);
    const next = COLUMNS[idx + dir];
    if (next) void patchTask(task.id, { status: next.key });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <KanbanSquare className="h-4 w-4 text-txt3" /> Board
        </h3>
        <form
          className="flex flex-1 justify-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addTask();
          }}
        >
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a task…"
            aria-label="New task title"
            className="max-w-[280px] py-1.5 text-[12.5px]"
          />
          <Button type="submit" variant="ghost" disabled={adding || !newTitle.trim()} className="shrink-0">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </form>
      </div>

      {tasks === null ? (
        <Card className="grid min-h-[80px] place-items-center p-4 text-xs text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </span>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.key);
                }}
                onDragLeave={() => setDragOver((cur) => (cur === col.key ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  if (dragId) void patchTask(dragId, { status: col.key });
                  setDragId(null);
                }}
                className={cn(
                  "rounded-card border bg-panel p-2.5 transition-colors",
                  dragOver === col.key ? "border-accent" : "border-border",
                )}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="label-tactical">{col.label}</span>
                  <span className="font-mono text-[10.5px] text-txt3">{colTasks.length}</span>
                </div>
                <ul className="space-y-2">
                  {colTasks.map((t) => {
                    const canDelete = t.createdById === youId || isOwner;
                    return (
                      <li
                        key={t.id}
                        draggable
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => setDragId(null)}
                        className={cn(
                          "group cursor-grab rounded-lg border border-border2 bg-panel2 p-2.5 active:cursor-grabbing",
                          dragId === t.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn("min-w-0 flex-1 text-[12.5px] leading-snug", t.status === "done" ? "text-txt3 line-through" : "text-txt")}>
                            {t.title}
                          </span>
                          {canDelete && (
                            <button
                              type="button"
                              aria-label={`Delete task ${t.title}`}
                              onClick={() => void deleteTask(t.id)}
                              className="shrink-0 text-txt3 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100 focus:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {t.note && <p className="mt-1 text-[11px] leading-snug text-txt3">{t.note}</p>}
                        <div className="mt-2 flex items-center gap-1.5">
                          {/* Assignee select, disguised as a chip. */}
                          {/* Assignee picker — a chip with a caret signals
                              it's interactive; the select overlays it. */}
                          <span
                            className="relative inline-flex cursor-pointer items-center gap-1 rounded-full border border-border2 bg-panel3 py-0.5 pl-0.5 pr-1.5 transition-colors hover:border-accent"
                            title={t.assigneeName ?? "Assign"}
                          >
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-panel2 text-[8px] font-semibold text-txt2">
                              {t.assigneeName ? initials(t.assigneeName) : <UserRound className="h-2.5 w-2.5" />}
                            </span>
                            <span className="max-w-[96px] truncate text-[10px] text-txt2">
                              {t.assigneeName ?? "Assign"}
                            </span>
                            <ChevronDown className="h-2.5 w-2.5 text-txt3" />
                            <select
                              value={t.assigneeId ?? ""}
                              onChange={(e) => void patchTask(t.id, { assigneeId: e.target.value || null }).then(load)}
                              aria-label={`Assign task ${t.title}`}
                              className="absolute inset-0 cursor-pointer opacity-0"
                            >
                              <option value="">Unassigned</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </span>
                          <span className="ml-auto flex gap-0.5">
                            <button
                              type="button"
                              aria-label={`Move ${t.title} left`}
                              disabled={col.key === "todo"}
                              onClick={() => moveBy(t, -1)}
                              className="rounded p-0.5 text-txt3 transition-colors hover:text-txt disabled:opacity-30"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${t.title} right`}
                              disabled={col.key === "done"}
                              onClick={() => moveBy(t, 1)}
                              className="rounded p-0.5 text-txt3 transition-colors hover:text-txt disabled:opacity-30"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-txt3">
                      {col.key === "todo" ? "Nothing here — add a task above." : "Drop tasks here."}
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
