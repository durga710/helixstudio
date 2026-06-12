/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount + URL-param sync effects; they set state from async loads / search params and behave correctly */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  Plus,
  Link2,
  Loader2,
  Sparkles,
  FolderGit2,
  FileCode2,
  MessageSquare,
  Lock,
  Pencil,
  Trash2,
  RefreshCw,
  LogOut,
  X,
  ArrowRight,
  GraduationCap,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";

type SpaceKind = "team" | "classroom";

interface SpaceSummary {
  id: string;
  name: string;
  kind: SpaceKind;
  isOwner: boolean;
  joinCode: string;
  memberCount: number;
  sharedCount: number;
}

interface Member {
  id: string;
  name: string;
  image: string | null;
  role: string;
  isYou: boolean;
}

interface SharedWorkspace {
  id: string;
  name: string;
  mode: "SCRATCH" | "IMPORT";
  provider: string;
  repo: string | null;
  updatedAt: string;
  ownerName: string;
  isYours: boolean;
  fileCount: number;
  messageCount: number;
}

interface SpaceDetail {
  id: string;
  name: string;
  kind: SpaceKind;
  isOwner: boolean;
  joinCode: string;
  members: Member[];
  workspaces: SharedWorkspace[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Pull the join code out of a full invite link, or accept a bare code. */
function extractCode(raw: string): string {
  const value = raw.trim();
  const marker = "/space/join/";
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.slice(idx + marker.length).split(/[?#/]/)[0].trim();
  return value;
}

export function SpaceScreen({ youName }: { youName?: string | null }) {
  const params = useSearchParams();
  const { toast } = useToast();

  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteInvalid, setInviteInvalid] = useState(false);

  // Create / join forms (empty state + sidebar).
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SpaceKind>("team");
  const [creating, setCreating] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [joining, setJoining] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadSpaces = useCallback(async (): Promise<SpaceSummary[] | null> => {
    try {
      const res = await fetch("/api/spaces", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setSpaces(json.data.spaces as SpaceSummary[]);
        setLoadError(null);
        return json.data.spaces as SpaceSummary[];
      }
      setLoadError(json?.error?.message ?? "Couldn't load your spaces.");
    } catch {
      setLoadError("Couldn't load your spaces.");
    }
    return null;
  }, []);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  // Honour ?invite=invalid and default-select ?s=<id> once spaces arrive.
  useEffect(() => {
    if (params.get("invite") === "invalid") setInviteInvalid(true);
  }, [params]);

  useEffect(() => {
    if (!spaces || spaces.length === 0) return;
    setSelectedId((cur) => {
      if (cur && spaces.some((s) => s.id === cur)) return cur;
      const wanted = params.get("s");
      if (wanted && spaces.some((s) => s.id === wanted)) return wanted;
      return spaces[0].id;
    });
  }, [spaces, params]);

  async function createSpace() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind: newKind }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setFormError(json?.error?.message ?? "Couldn't create the space.");
      } else {
        setNewName("");
        await loadSpaces();
        setSelectedId(json.data.id);
        toast("Space created");
      }
    } catch {
      setFormError("Couldn't create the space.");
    }
    setCreating(false);
  }

  async function joinSpace() {
    const code = extractCode(joinValue);
    if (!code || joining) return;
    setJoining(true);
    setFormError(null);
    try {
      const res = await fetch("/api/spaces/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setFormError(json?.error?.message ?? "That invite link is invalid or expired.");
      } else {
        setJoinValue("");
        await loadSpaces();
        setSelectedId(json.data.id);
        toast(`Joined ${json.data.name}`);
      }
    } catch {
      setFormError("Couldn't join the space.");
    }
    setJoining(false);
  }

  /* ------------------------------- render ---------------------------- */

  if (spaces === null && !loadError) {
    return (
      <div className="pad-screen">
        <div className="mx-auto grid min-h-[40vh] max-w-[1100px] place-items-center text-sm text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> loading your spaces…
          </span>
        </div>
      </div>
    );
  }

  const hasSpaces = (spaces?.length ?? 0) > 0;

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">
          Collaborate
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Spaces</h1>
          <Users className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 text-[13px] text-txt2">
          A Space is a group of people. Invite friends with a link, then see and open each
          other&apos;s projects — read-only, copy any to make it yours.
        </p>

        {inviteInvalid && (
          <Card className="mt-4 flex items-center gap-3 border-warn/40 bg-warn/10 p-3.5">
            <span className="text-[13px] text-warn">That invite link is invalid or expired.</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setInviteInvalid(false)}
              className="ml-auto text-txt3 transition-colors hover:text-txt"
            >
              <X className="h-4 w-4" />
            </button>
          </Card>
        )}

        {loadError ? (
          <Card className="mt-6 p-8 text-center text-sm text-bad">
            {loadError}{" "}
            <button className="cursor-pointer underline" onClick={() => void loadSpaces()}>
              Retry
            </button>
          </Card>
        ) : !hasSpaces ? (
          <EmptyState
            newName={newName}
            setNewName={setNewName}
            newKind={newKind}
            setNewKind={setNewKind}
            creating={creating}
            onCreate={createSpace}
            joinValue={joinValue}
            setJoinValue={setJoinValue}
            joining={joining}
            onJoin={joinSpace}
            error={formError}
          />
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[260px_1fr]">
            <SpaceList
              spaces={spaces!}
              selectedId={selectedId}
              onSelect={setSelectedId}
              joinValue={joinValue}
              setJoinValue={setJoinValue}
              joining={joining}
              onJoin={joinSpace}
              newName={newName}
              setNewName={setNewName}
              newKind={newKind}
              setNewKind={setNewKind}
              creating={creating}
              onCreate={createSpace}
              error={formError}
            />
            {selectedId ? (
              <SpaceDetailPanel
                key={selectedId}
                spaceId={selectedId}
                youName={youName}
                onChanged={loadSpaces}
                onLeftOrDeleted={async () => {
                  setSelectedId(null);
                  const next = await loadSpaces();
                  if (next && next.length > 0) setSelectedId(next[0].id);
                }}
              />
            ) : (
              <Card className="grid min-h-[200px] place-items-center p-8 text-sm text-txt3">
                Select a space.
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ empty state ----------------------------- */

const KIND_OPTIONS = [
  { value: "team", label: "Team" },
  { value: "classroom", label: "Classroom" },
] as const;

function EmptyState({
  newName,
  setNewName,
  newKind,
  setNewKind,
  creating,
  onCreate,
  joinValue,
  setJoinValue,
  joining,
  onJoin,
  error,
}: {
  newName: string;
  setNewName: (v: string) => void;
  newKind: SpaceKind;
  setNewKind: (v: SpaceKind) => void;
  creating: boolean;
  onCreate: () => void;
  joinValue: string;
  setJoinValue: (v: string) => void;
  joining: boolean;
  onJoin: () => void;
  error: string | null;
}) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card className="p-6">
        <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
          <Plus className="h-5 w-5 text-accent" />
        </span>
        <h2 className="mb-1 text-base font-medium text-txt">Create a Space</h2>
        <p className="mb-4 text-xs leading-relaxed text-txt3">
          Start a group, then share an invite link. A team shares work with everyone; a
          classroom adds assignments the owner hands out and reviews.
        </p>
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate();
          }}
        >
          <Segmented
            options={KIND_OPTIONS}
            value={newKind}
            onChange={setNewKind}
            aria-label="Space type"
            className="self-start"
          />
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={newKind === "classroom" ? "Classroom name" : "Space name"}
              aria-label="Space name"
              className="text-[13px]"
            />
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-border2 bg-panel2">
          <Link2 className="h-5 w-5 text-txt2" />
        </span>
        <h2 className="mb-1 text-base font-medium text-txt">Join with a link</h2>
        <p className="mb-4 text-xs leading-relaxed text-txt3">
          Paste an invite link a friend sent you (or just the code) to join their Space.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onJoin();
          }}
        >
          <Input
            value={joinValue}
            onChange={(e) => setJoinValue(e.target.value)}
            placeholder="Paste invite link or code"
            aria-label="Invite link or code"
            className="font-mono text-[12px]"
          />
          <Button type="submit" variant="ghost" disabled={joining || !joinValue.trim()}>
            {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
          </Button>
        </form>
      </Card>

      {error && <p className="text-xs text-warn md:col-span-2">{error}</p>}
    </div>
  );
}

/* ------------------------------ space list ------------------------------ */

function SpaceList({
  spaces,
  selectedId,
  onSelect,
  joinValue,
  setJoinValue,
  joining,
  onJoin,
  newName,
  setNewName,
  newKind,
  setNewKind,
  creating,
  onCreate,
  error,
}: {
  spaces: SpaceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  joinValue: string;
  setJoinValue: (v: string) => void;
  joining: boolean;
  onJoin: () => void;
  newName: string;
  setNewName: (v: string) => void;
  newKind: SpaceKind;
  setNewKind: (v: SpaceKind) => void;
  creating: boolean;
  onCreate: () => void;
  error: string | null;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="label-tactical">Your spaces</span>
        <button
          type="button"
          aria-label="New space"
          title="New space"
          onClick={() => setAdding((a) => !a)}
          className="text-txt3 transition-colors hover:text-accent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="space-y-1">
        {spaces.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-card border px-3 py-2.5 text-left transition-colors",
                selectedId === s.id
                  ? "border-accent bg-hl"
                  : "border-border bg-panel hover:border-accent/50",
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border2 bg-panel2 text-[11px] font-semibold text-txt2">
                {initials(s.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-txt">
                  <span className="truncate">{s.name}</span>
                  {s.kind === "classroom" && (
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-txt3" aria-label="Classroom" />
                  )}
                </span>
                <span className="block text-[11px] text-txt3">
                  {s.memberCount} {s.memberCount === 1 ? "member" : "members"} ·{" "}
                  {s.sharedCount} shared
                </span>
              </span>
              {s.isOwner && (
                <Pill tone="accent" className="shrink-0">
                  owner
                </Pill>
              )}
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <Card className="mt-1 space-y-3 p-3">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate();
            }}
          >
            <Segmented
              options={KIND_OPTIONS}
              value={newKind}
              onChange={setNewKind}
              aria-label="Space type"
              className="self-start"
            />
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New space name"
                aria-label="New space name"
                className="text-[12.5px]"
              />
              <Button type="submit" disabled={creating || !newName.trim()} className="shrink-0">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
              </Button>
            </div>
          </form>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin();
            }}
          >
            <Input
              value={joinValue}
              onChange={(e) => setJoinValue(e.target.value)}
              placeholder="Join with a link"
              aria-label="Join with a link"
              className="font-mono text-[11.5px]"
            />
            <Button type="submit" variant="ghost" disabled={joining || !joinValue.trim()} className="shrink-0">
              {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
            </Button>
          </form>
          {error && <p className="text-[11px] text-warn">{error}</p>}
        </Card>
      )}
    </div>
  );
}

/* ---------------------------- detail panel ------------------------------ */

function SpaceDetailPanel({
  spaceId,
  youName,
  onChanged,
  onLeftOrDeleted,
}: {
  spaceId: string;
  youName?: string | null;
  onChanged: () => Promise<unknown>;
  onLeftOrDeleted: () => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setDetail(json.data as SpaceDetail);
      } else {
        setError(json?.error?.message ?? "Couldn't load this space.");
      }
    } catch {
      setError("Couldn't load this space.");
    }
  }, [spaceId]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  function copyInvite(joinCode: string) {
    const url = `${window.location.origin}/space/join/${joinCode}`;
    void navigator.clipboard?.writeText(url);
    toast("Invite link copied");
  }

  async function rename() {
    const name = renameValue.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", name }),
      });
      if (res.ok) {
        setRenaming(false);
        await load();
        await onChanged();
        toast("Renamed");
      } else {
        toast("Couldn't rename");
      }
    } catch {
      toast("Couldn't rename");
    }
    setBusy(false);
  }

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate-code" }),
      });
      if (res.ok) {
        await load();
        await onChanged();
        toast("New invite link generated");
      } else {
        toast("Couldn't regenerate the link");
      }
    } catch {
      toast("Couldn't regenerate the link");
    }
    setBusy(false);
  }

  async function deleteSpace() {
    if (busy) return;
    if (!window.confirm("Delete this space? Shared workspaces stay with their owners but stop being shared here.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, { method: "DELETE" });
      if (res.ok) {
        toast("Space deleted");
        await onLeftOrDeleted();
      } else {
        toast("Couldn't delete the space");
        setBusy(false);
      }
    } catch {
      toast("Couldn't delete the space");
      setBusy(false);
    }
  }

  async function leave() {
    if (busy) return;
    if (!window.confirm("Leave this space? You'll lose access to its shared workspaces.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/leave`, { method: "POST" });
      if (res.ok) {
        toast("Left the space");
        await onLeftOrDeleted();
      } else {
        toast("Couldn't leave the space");
        setBusy(false);
      }
    } catch {
      toast("Couldn't leave the space");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Card className="grid min-h-[200px] place-items-center p-8 text-center text-sm text-bad">
        <div>
          {error}{" "}
          <button className="cursor-pointer underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="grid min-h-[200px] place-items-center p-8 text-sm text-txt3">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> loading…
        </span>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {renaming ? (
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                aria-label="Space name"
                className="max-w-xs text-[15px] font-semibold"
              />
              <Button type="submit" disabled={busy || !renameValue.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <h2 className="truncate text-lg font-semibold text-txt">{detail.name}</h2>
              {detail.kind === "classroom" && <Pill tone="neutral">classroom</Pill>}
              {detail.isOwner ? (
                <Pill tone="accent">{detail.kind === "classroom" ? "instructor" : "owner"}</Pill>
              ) : (
                <Pill tone="neutral">{detail.kind === "classroom" ? "student" : "member"}</Pill>
              )}
              {detail.isOwner && (
                <button
                  type="button"
                  aria-label="Rename space"
                  title="Rename space"
                  onClick={() => {
                    setRenameValue(detail.name);
                    setRenaming(true);
                  }}
                  className="text-txt3 transition-colors hover:text-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}

          {!renaming && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button onClick={() => copyInvite(detail.joinCode)}>
                <Link2 className="h-3.5 w-3.5" /> Invite
              </Button>
              {detail.isOwner ? (
                <>
                  <Button variant="ghost" onClick={() => void regenerate()} disabled={busy}>
                    <RefreshCw className="h-3.5 w-3.5" /> New link
                  </Button>
                  <Button variant="ghost" onClick={() => void deleteSpace()} disabled={busy}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => void leave()} disabled={busy}>
                  <LogOut className="h-3.5 w-3.5" /> Leave
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {detail.members.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border border-border2 bg-panel2 py-1 pl-1 pr-2.5"
              title={m.name}
            >
              <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full border border-border bg-panel3 text-[10px] font-semibold text-txt2">
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(m.name)
                )}
              </span>
              <span className="text-[12px] text-txt2">
                {m.isYou ? `${youName ?? m.name} (you)` : m.name}
              </span>
              {m.role === "owner" && (
                <Pill tone="accent">{detail.kind === "classroom" ? "instructor" : "owner"}</Pill>
              )}
            </span>
          ))}
        </div>
      </Card>

      {/* Shared workspaces */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Shared workspaces</h3>
          <span className="text-[11px] text-txt3">{detail.workspaces.length} project(s)</span>
        </div>

        {detail.workspaces.length === 0 ? (
          <Card className="p-8 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-txt3" />
            <p className="text-sm text-txt2">No workspaces shared here yet.</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-txt3">
              Open one of your workspaces in the editor and use the{" "}
              <span className="text-txt2">Share</span> control to add it to this space.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {detail.workspaces.map((w) => {
              const meta = PROVIDER_META[w.provider as GitProviderName];
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/editor/${w.id}`)}
                    className="block w-full rounded-card border border-border bg-panel p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:border-accent"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {w.mode === "IMPORT" ? (
                        <FolderGit2 className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <Sparkles className="h-4 w-4 shrink-0 text-ok" />
                      )}
                      <span className="truncate text-[13.5px] font-semibold text-txt">{w.name}</span>
                    </div>
                    <p className="mb-2 truncate text-[11px] text-txt3">
                      {w.isYours ? "by you" : `by ${w.ownerName}`}
                    </p>
                    {w.repo && (
                      <p className="mb-2 flex items-center gap-1 truncate font-mono text-[11px] text-txt3">
                        <Lock className="h-3 w-3 shrink-0 opacity-60" />
                        <span className="truncate">{w.repo}</span>
                        {w.provider !== "github" && meta && (
                          <span className="shrink-0 text-[9px] uppercase tracking-wide opacity-70">
                            {meta.label}
                          </span>
                        )}
                      </p>
                    )}
                    <div className="flex items-center gap-3 font-mono text-[10.5px] text-txt3">
                      <span className="inline-flex items-center gap-1">
                        <FileCode2 className="h-3 w-3" /> {w.fileCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {w.messageCount}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1">
                        {timeAgo(w.updatedAt)}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
