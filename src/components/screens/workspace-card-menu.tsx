"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, ExternalLink, SquarePen, CopyPlus, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The per-card quick-actions menu (the gear in a workspace card's top-right).
 * Lives inside the card's clickable area, so every interactive element stops the
 * click from bubbling up and opening the project. Actions hit the existing
 * workspace API (rename = PATCH, duplicate = POST /fork, delete = DELETE) and
 * refresh the list in place.
 *
 * `canManage` is false for teammates' shared projects (you don't own them) — the
 * menu then shows only the actions a non-owner can actually do: open + duplicate.
 */
export function WorkspaceCardMenu({
  id,
  name,
  canManage = true,
}: {
  id: string;
  name: string;
  canManage?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "rename" | "delete">(null);
  const [draftName, setDraftName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Close the dropdown on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Auto-dismiss the floating error toast (used for actions with no dialog).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Don't let any menu interaction trigger the card's navigation.
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const openDialog = (which: "rename" | "delete") => (e: React.MouseEvent) => {
    stop(e);
    setError(null);
    setDraftName(name);
    setOpen(false);
    setDialog(which);
  };

  async function rename() {
    const next = draftName.trim();
    if (!next || next === name) {
      setDialog(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) throw new Error();
      setDialog(null);
      router.refresh();
    } catch {
      setError("Couldn't rename — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(e: React.MouseEvent) {
    stop(e);
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${id}/fork`, { method: "POST" });
      if (!res.ok) throw new Error();
      setToast("Duplicated — copy added to your list.");
      router.refresh();
    } catch {
      setToast("Couldn't duplicate — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDialog(null);
      router.refresh();
    } catch {
      setError("Couldn't delete — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="absolute right-2 top-2.5 z-20" onClick={stop}>
      <button
        type="button"
        aria-label="Workspace actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-md text-txt3 opacity-60 transition-all hover:bg-panel2 hover:text-txt hover:opacity-100",
          open && "bg-panel2 text-txt opacity-100",
        )}
      >
        {busy && !dialog ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Settings className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-lg border border-border bg-panel2 py-1 shadow-card-lg"
        >
          <MenuItem
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="Open in new tab"
            onClick={(e) => {
              stop(e);
              setOpen(false);
              window.open(`/editor/${id}`, "_blank", "noopener");
            }}
          />
          {canManage && (
            <MenuItem icon={<SquarePen className="h-3.5 w-3.5" />} label="Rename" onClick={openDialog("rename")} />
          )}
          <MenuItem icon={<CopyPlus className="h-3.5 w-3.5" />} label="Duplicate" onClick={duplicate} />
          {canManage && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="Delete"
                danger
                onClick={openDialog("delete")}
              />
            </>
          )}
        </div>
      )}

      {toast && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border bg-panel2 px-2.5 py-1.5 text-[11px] text-txt2 shadow-card-lg">
          {toast}
        </div>
      )}

      {/* Rename dialog */}
      {dialog === "rename" && (
        <Modal onClose={() => !busy && setDialog(null)}>
          <h4 className="text-sm font-semibold text-txt">Rename workspace</h4>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void rename();
            }}
            maxLength={80}
            className="mt-3 w-full rounded-lg border border-border bg-bg2 px-3 py-2 text-sm text-txt outline-none focus:border-accent"
            placeholder="Workspace name"
          />
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <DialogBtn onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </DialogBtn>
            <DialogBtn primary onClick={() => void rename()} disabled={busy || !draftName.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </DialogBtn>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {dialog === "delete" && (
        <Modal onClose={() => !busy && setDialog(null)}>
          <h4 className="text-sm font-semibold text-txt">Delete workspace</h4>
          <p className="mt-2 text-[13px] leading-relaxed text-txt2">
            Delete <span className="font-semibold text-txt">{name}</span>? This removes its files and
            chat history and can&apos;t be undone.
          </p>
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <DialogBtn onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </DialogBtn>
            <DialogBtn danger onClick={() => void remove()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
            </DialogBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors",
        danger
          ? "text-bad hover:bg-[color-mix(in_srgb,var(--bad)_14%,transparent)]"
          : "text-txt2 hover:bg-panel hover:text-txt",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-card border border-border bg-panel p-5 shadow-card-lg"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DialogBtn({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      disabled={disabled}
      className={cn(
        "grid min-w-[68px] place-items-center rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-opacity disabled:opacity-50",
        primary && "bg-accent text-white hover:opacity-90",
        danger && "bg-bad text-white hover:opacity-90",
        !primary && !danger && "border border-border text-txt2 hover:opacity-90",
      )}
    >
      {children}
    </button>
  );
}
