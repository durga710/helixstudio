/* eslint-disable react-hooks/set-state-in-effect -- ported GCODE studio code; its fetch-on-mount/poll effects predate this rule and behave correctly */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Code2,
  Copy,
  Eye,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FolderGit2,
  GitBranch,
  GitCompare,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Play,
  RefreshCw,
  Save,
  ScrollText,
  Settings2,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { composePreviewHtml, pickPreviewEntry } from "@/lib/preview-html";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { Markdown } from "@/components/ui/markdown";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";
import type { Changes, WorkspaceMeta } from "@/components/studio/studio";
import { PushDialog } from "@/components/studio/push-dialog";
import { EnvDialog } from "@/components/studio/env-dialog";
import { ShareMenu } from "@/components/studio/share-menu";
import { FileTree, type TreeFile } from "@/components/studio/file-tree";
import { readCache, writeCache } from "@/lib/client-cache";
import { LedgerPanel, type LedgerDto } from "@/components/studio/ledger-panel";
import { IntentsPanel } from "@/components/studio/intents-panel";
import { UndoDialog } from "@/components/studio/undo-dialog";
import { IntentPopover } from "@/components/studio/intent-popover";
import type { OnMount } from "@monaco-editor/react";

const editorLoading = (
  <div className="grid h-full place-items-center text-sm text-txt3">
    <span className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> loading editor…
    </span>
  </div>
);

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => editorLoading,
});

const MonacoDiff = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  {
    ssr: false,
    loading: () => editorLoading,
  },
);

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  sql: "sql",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  prisma: "graphql",
};

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGES[ext] ?? "plaintext";
}

/** Follow Helix's data-theme attribute so Monaco matches light/dark mode. */
function useMonacoTheme(): "light" | "vs-dark" {
  const [theme, setTheme] = useState<"light" | "vs-dark">("vs-dark");
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "vs-dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * The coding workspace: collapsible file tree + Monaco editor, with a
 * two-tab Code/Preview system. Preview composes the workspace's HTML with
 * its relative CSS/JS inlined, so static apps run live in a sandboxed
 * iframe. Manual edits accumulate in a dirty map and Save writes them to
 * the overlay; Push ships the overlay to GitHub.
 */
export function WorkspacePanel({
  workspace,
  changes,
  isGuest,
  isOwner = true,
  ownerName,
}: {
  workspace: WorkspaceMeta;
  changes: Changes | null;
  isGuest?: boolean;
  /** False when a Space member is viewing a teammate's shared workspace. */
  isOwner?: boolean;
  ownerName?: string;
}) {
  const router = useRouter();
  const isNew = useSearchParams().get("new") === "1";
  const { toast } = useToast();
  const [forking, setForking] = useState(false);
  const [files, setFiles] = useState<TreeFile[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [loadingFile, setLoadingFile] = useState(false);

  const [tab, setTab] = useState<"code" | "preview" | "diff" | "intents">("code");
  const [fullscreen, setFullscreen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const composeSeq = useRef(0);
  const monacoTheme = useMonacoTheme();

  // Intent ledger: per-line provenance in the Code tab + the Intents tab's
  // change timeline + intentional undo.
  const [ledgerOn, setLedgerOn] = useState(false);
  const [ledger, setLedger] = useState<LedgerDto | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerLine, setLedgerLine] = useState<number | null>(null);
  const [ledgerNonce, setLedgerNonce] = useState(0); // bumps when files change
  const [undoIntent, setUndoIntent] = useState<{ id: string; title: string } | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const ledgerDecoRef = useRef<{ clear(): void } | null>(null);
  const [editorMounted, setEditorMounted] = useState(0);

  // Fresh-change highlight: paths from the latest change manifest get their
  // new lines highlighted in the Code tab, with a hover/click provenance
  // card anchored next to them. Works without the Ledger toggle.
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [popover, setPopover] = useState<{
    line: number;
    /** First line of the highlighted block — the card's identity (prevents
     * re-anchoring jitter while the mouse moves within the block). */
    anchor: number;
    intentId: string;
    top: number;
    left: number;
    placeAbove: boolean;
    pinned: boolean;
  } | null>(null);
  const recentRangesRef = useRef<{ start: number; end: number; intentId: string }[]>([]);
  const popoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Framework app runner (Next.js/Vite/Flask… on this machine in dev, in a
  // cloud VM with a public preview URL on the hosted site)
  interface RunInfo {
    status: "exporting" | "installing" | "starting" | "running" | "stopped" | "error";
    framework: string;
    url: string | null;
    port: number | null;
    reachable: boolean;
    logs: string[];
  }
  const [run, setRun] = useState<RunInfo | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Diff tab: pending workspace changes vs the base branch.
  interface DiffEntry {
    path: string;
    status: "added" | "modified" | "deleted";
    base: string;
    current: string;
  }
  const [diffEntries, setDiffEntries] = useState<DiffEntry[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffSelected, setDiffSelected] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // A workspace with a package.json (or python entry) is a framework app —
  // the static compose can't represent it; the runner can.
  const isFrameworkApp = useMemo(
    () =>
      files.some((f) => f.path === "package.json") ||
      files.some((f) => /^(app|main|server)\.py$/.test(f.path)),
    [files],
  );

  const dirtyCount = Object.keys(dirty).length;
  const dirtyPaths = useMemo(() => new Set(Object.keys(dirty)), [dirty]);
  const currentContent = selected ? (dirty[selected] ?? contents[selected] ?? "") : "";

  // Approximate pending-change count for the tab badge — overlay files in the
  // tree (the diff fetch gives the authoritative number once the tab opens).
  const changedCount = useMemo(
    () =>
      diffEntries
        ? diffEntries.length
        : files.filter((f) => f.source === "workspace").length,
    [diffEntries, files],
  );

  /* ------------------------------ data ------------------------------ */

  const loadTree = useCallback(async () => {
    // Paint the last-known tree instantly; the fetch below refreshes it.
    const cached = readCache<TreeFile[]>(`ws:${workspace.id}:tree`);
    if (cached) setFiles(cached);
    else setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/files`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (!cached) setTreeError(json?.error?.message ?? "Couldn't load the workspace files.");
      } else {
        setFiles(json.data.files);
        writeCache(`ws:${workspace.id}:tree`, json.data.files);
      }
    } catch {
      if (!cached) setTreeError("Couldn't load the workspace files.");
    }
    setLoadingTree(false);
  }, [workspace.id]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const fetchContent = useCallback(
    async (path: string): Promise<string | null> => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspace.id}/file?path=${encodeURIComponent(path)}`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) return json.data.content as string;
        return null;
      } catch {
        return null;
      }
    },
    [workspace.id],
  );

  const openFile = useCallback(
    async (path: string, force = false) => {
      setSelected(path);
      setTab("code");
      if (!force && (dirty[path] !== undefined || contents[path] !== undefined)) return;
      setLoadingFile(true);
      const content = await fetchContent(path);
      setContents((c) => ({ ...c, [path]: content ?? "// couldn't load file" }));
      setLoadingFile(false);
    },
    [dirty, contents, fetchContent],
  );

  // A change manifest landed (AI chat turn or an applied undo): merge new
  // paths into the tree, invalidate their cached content, refresh the open
  // file, drop deleted paths.
  const applyChangesManifest = useCallback((written: string[], deleted: string[]) => {
    setFiles((f) => {
      const next = f.filter((e) => !deleted.includes(e.path));
      for (const p of written) {
        if (!next.some((e) => e.path === p)) next.push({ path: p, size: 0, source: "workspace" });
      }
      return next;
    });
    setContents((c) => {
      const next = { ...c };
      for (const p of [...written, ...deleted]) delete next[p];
      return next;
    });
    setDirty((d) => {
      // The AI rewrote these files — its version is now the truth.
      const next = { ...d };
      for (const p of [...written, ...deleted]) delete next[p];
      return next;
    });
    setSelected((sel) => {
      if (sel && deleted.includes(sel)) return null;
      if (sel && written.includes(sel)) void openFile(sel, true);
      return sel;
    });
    setPreviewNonce((n) => n + 1); // recompose the preview with fresh files
    setLedgerNonce((n) => n + 1); // refetch blame + the intents timeline
    setRecentPaths(written); // highlight the fresh lines in the Code tab
    setPopover(null);
  }, [openFile]);

  useEffect(() => {
    if (!changes) return;
    const { written, deleted } = changes;
    applyChangesManifest(written, deleted);
    setNote(
      [
        written.length ? `AI wrote ${written.length} file(s) · saved` : null,
        deleted.length ? `deleted ${deleted.length}` : null,
      ]
        .filter(Boolean)
        .join(", "),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes?.nonce]);

  /* --------------------------- intent ledger ------------------------ */

  // Clicking a different file resets the line selection + popover.
  useEffect(() => {
    setLedgerLine(null);
    setPopover(null);
  }, [selected]);

  // Blame for the open file — while the ledger panel is on, or when the file
  // was just changed (the fresh-change highlight + popover need attribution).
  useEffect(() => {
    const wanted = ledgerOn || (!!selected && recentPaths.includes(selected));
    if (!wanted || !selected || tab !== "code") return;
    let alive = true;
    setLedgerLoading(true);
    fetch(`/api/workspaces/${workspace.id}/ledger?path=${encodeURIComponent(selected)}`, {
      cache: "no-store",
    })
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        if (!alive) return;
        setLedger(json?.ok ? (json.data as LedgerDto) : null);
        setLedgerLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLedger(null);
        setLedgerLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ledgerOn, selected, tab, workspace.id, ledgerNonce, recentPaths]);

  // The intent that "just happened" for the open file — its lines get the
  // background highlight + popover. Newest intent still owning a line wins.
  const recentIntentId = useMemo(() => {
    if (!ledger || !selected || !recentPaths.includes(selected)) return null;
    let best: { id: string; t: number } | null = null;
    for (const it of Object.values(ledger.intents)) {
      const t = new Date(it.createdAt).getTime();
      if (!best || t > best.t) best = { id: it.id, t };
    }
    return best?.id ?? null;
  }, [ledger, selected, recentPaths]);

  const scheduleHidePopover = useCallback(() => {
    if (popoverHideTimer.current) clearTimeout(popoverHideTimer.current);
    popoverHideTimer.current = setTimeout(() => {
      setPopover((p) => (p?.pinned ? p : null));
    }, 300);
  }, []);

  const cancelHidePopover = useCallback(() => {
    if (popoverHideTimer.current) {
      clearTimeout(popoverHideTimer.current);
      popoverHideTimer.current = null;
    }
  }, []);

  // Anchor the card just under (or above) the hovered/clicked line.
  const openPopoverAt = useCallback((line: number, pinned: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = recentRangesRef.current.find((r) => line >= r.start && line <= r.end);
    if (!range) return;
    const pos = editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
    if (!pos) return;
    const height = editor.getLayoutInfo().height;
    const placeAbove = pos.top > height * 0.6;
    setPopover((p) => {
      if (p && p.anchor === range.start) {
        // Same block — keep the card where it is; a click just pins it.
        return pinned && !p.pinned ? { ...p, pinned: true, line } : p;
      }
      if (p?.pinned && !pinned) return p; // a pinned card stays put
      return {
        line,
        anchor: range.start,
        intentId: range.intentId,
        top: placeAbove ? pos.top - 6 : pos.top + pos.height + 6,
        left: 72,
        placeAbove,
        pinned,
      };
    });
  }, []);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      editor.onMouseDown((e: { target?: { position?: { lineNumber?: number } | null } }) => {
        const line = e.target?.position?.lineNumber;
        if (!line) return;
        setLedgerLine(line);
        const inRecent = recentRangesRef.current.some((r) => line >= r.start && line <= r.end);
        if (inRecent) {
          cancelHidePopover();
          openPopoverAt(line, true);
        } else {
          setPopover((p) => (p?.pinned ? null : p)); // click elsewhere closes a pinned card
        }
      });
      editor.onMouseMove((e: { target?: { position?: { lineNumber?: number } | null } }) => {
        const line = e.target?.position?.lineNumber;
        const inRecent = !!line && recentRangesRef.current.some((r) => line >= r.start && line <= r.end);
        if (inRecent) {
          cancelHidePopover();
          openPopoverAt(line!, false);
        } else {
          scheduleHidePopover();
        }
      });
      editor.onDidScrollChange(() => setPopover(null)); // anchors go stale
      setEditorMounted((n) => n + 1);
    },
    [openPopoverAt, scheduleHidePopover, cancelHidePopover],
  );

  // Editor decorations: gutter bars per attributed range while the Ledger
  // toggle is on (accent = agent, amber = manual, red = undo, dimmed =
  // uncaptured; base lines unmarked), plus a background highlight on the
  // lines the latest change introduced (always on — the hover card's target).
  useEffect(() => {
    try {
      ledgerDecoRef.current?.clear();
    } catch {
      /* editor already disposed */
    }
    ledgerDecoRef.current = null;
    recentRangesRef.current = [];
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !ledger || tab !== "code") return;

    const classFor = (intentId: string | null): string | null => {
      if (!intentId) return null;
      if (intentId === "uncaptured") return "ledger-line-uncaptured";
      const kind = ledger.intents[intentId]?.kind;
      return kind === "manual"
        ? "ledger-line-manual"
        : kind === "undo"
          ? "ledger-line-undo"
          : "ledger-line-agent";
    };
    type Deco = { range: InstanceType<typeof monaco.Range>; options: Record<string, unknown> };
    const decos: Deco[] = [];
    for (const r of ledger.ranges) {
      if (ledgerOn) {
        const cls = classFor(r.intentId);
        if (cls) {
          decos.push({
            range: new monaco.Range(r.start, 1, r.end, 1),
            options: { isWholeLine: true, linesDecorationsClassName: cls },
          });
        }
      }
      if (recentIntentId && r.intentId === recentIntentId) {
        recentRangesRef.current.push({ start: r.start, end: r.end, intentId: r.intentId });
        decos.push({
          range: new monaco.Range(r.start, 1, r.end, 1),
          options: { isWholeLine: true, className: "ledger-line-recent-bg" },
        });
      }
    }
    if (decos.length) ledgerDecoRef.current = editor.createDecorationsCollection(decos);
    return () => {
      try {
        ledgerDecoRef.current?.clear();
      } catch {
        /* editor already disposed */
      }
      ledgerDecoRef.current = null;
      recentRangesRef.current = [];
    };
  }, [ledger, ledgerOn, tab, editorMounted, recentIntentId]);

  /* ----------------------------- actions ---------------------------- */

  function createFile() {
    const path = newFilePath.trim().replace(/^\/+/, "");
    if (!path) return;
    if (!/^[\w./ -]+$/.test(path) || path.split("/").some((s) => !s || s === "." || s === "..")) {
      setNewFileError("Use a relative path like src/app.ts — no “..” or special characters.");
      return;
    }
    if (files.some((f) => f.path === path)) {
      setNewFileError("That file already exists.");
      return;
    }
    setDirty((d) => ({ ...d, [path]: "// new file\n" }));
    setFiles((f) => [...f, { path, size: 0, source: "workspace" as const }]);
    setSelected(path);
    setTab("code");
    setNewFileOpen(false);
    setNewFilePath("");
    setNewFileError(null);
  }

  async function deleteFile(path: string) {
    if (!window.confirm(`Delete ${path}?`)) return;
    try {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/files?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNote(json?.error?.message ?? "Delete failed.");
        return;
      }
      setFiles((f) => f.filter((e) => e.path !== path));
      setContents((c) => {
        const next = { ...c };
        delete next[path];
        return next;
      });
      setDirty((d) => {
        const next = { ...d };
        delete next[path];
        return next;
      });
      setSelected((sel) => (sel === path ? null : sel));
      setNote(`Deleted ${path}`);
      setLedgerNonce((n) => n + 1);
    } catch {
      setNote("Delete failed.");
    }
  }

  async function save() {
    if (!dirtyCount || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: Object.entries(dirty).map(([path, content]) => ({ path, content })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNote(json?.error?.message ?? "Save failed.");
      } else {
        setContents((c) => ({ ...c, ...dirty }));
        setDirty({});
        setNote("Saved ✓");
        setPreviewNonce((n) => n + 1);
        setLedgerNonce((n) => n + 1); // the save is a new manual-edit intent
      }
    } catch {
      setNote("Save failed.");
    }
    setSaving(false);
  }

  // Non-owner action: copy a teammate's shared workspace into a fresh scratch
  // workspace you own, then jump into it (now fully editable).
  async function forkWorkspace() {
    if (forking) return;
    setForking(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/fork`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast(json?.error?.message ?? "Couldn't copy this workspace.");
        setForking(false);
      } else {
        toast("Copied to your workspaces");
        router.push(`/editor/${json.data.id}`);
      }
    } catch {
      toast("Couldn't copy this workspace.");
      setForking(false);
    }
  }

  /* ------------------------------- diff ----------------------------- */

  const loadDiff = useCallback(async () => {
    setDiffLoading(true);
    setDiffError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/diff`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setDiffError(json?.error?.message ?? "Couldn't load the diff.");
      } else {
        const entries = (json.data.entries ?? []) as DiffEntry[];
        setDiffEntries(entries);
        setDiffSelected((sel) =>
          sel && entries.some((e) => e.path === sel) ? sel : (entries[0]?.path ?? null),
        );
      }
    } catch {
      setDiffError("Couldn't load the diff.");
    }
    setDiffLoading(false);
    // DiffEntry is a stable local type; workspace.id is the only real dep.
     
  }, [workspace.id]);

  // Fetch the diff whenever the tab opens or AI/manual changes land while open.
  useEffect(() => {
    if (tab !== "diff") return;
    void loadDiff();
  }, [tab, loadDiff, changes?.nonce]);

  async function runReview() {
    if (reviewing) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/review`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setReview(json?.error?.message ?? "Review failed.");
      } else {
        setReview(json.data.text);
      }
    } catch {
      setReview("Review failed.");
    }
    setReviewing(false);
  }

  const diffSelectedEntry = useMemo(
    () => diffEntries?.find((e) => e.path === diffSelected) ?? null,
    [diffEntries, diffSelected],
  );

  /* ----------------------------- preview ---------------------------- */

  // The preview entry: the selected HTML file if one is open, else index.html,
  // else the first HTML file in the tree.
  const previewEntry = useMemo(
    () => pickPreviewEntry(files.map((f) => f.path), selected),
    [files, selected],
  );

  // Compose the preview: take the entry HTML and inline its RELATIVE css/js
  // references from workspace files, so multi-file static apps run in one
  // sandboxed iframe.
  useEffect(() => {
    if (tab !== "preview") return;
    if (!previewEntry) {
      setPreviewHtml(null);
      setPreviewInfo(null);
      return;
    }
    const seq = ++composeSeq.current;
    (async () => {
      const getFile = async (path: string): Promise<string | null> => {
        if (dirty[path] !== undefined) return dirty[path];
        if (contents[path] !== undefined) return contents[path];
        return fetchContent(path);
      };

      const composed = await composePreviewHtml(previewEntry, getFile);
      if (seq !== composeSeq.current) return;
      if (!composed) {
        setPreviewHtml(null);
        setPreviewInfo("Couldn't load the page.");
        return;
      }

      setPreviewHtml(composed.html);
      setPreviewInfo(
        `${previewEntry}${composed.inlined.length ? ` + ${composed.inlined.length} inlined asset(s)` : ""}`,
      );
    })();
  }, [tab, previewEntry, previewNonce, dirty, contents, fetchContent]);

  // Esc exits fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  /* --------------------------- app runner --------------------------- */

  const refreshRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/run`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setRun(json.data);
    } catch {
      // next poll will catch up
    }
  }, [workspace.id]);

  async function startApp() {
    if (runBusy) return;
    setRunBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/run`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setRun(json.data);
      else setNote(json?.error?.message ?? "Couldn't start the app.");
    } catch {
      setNote("Couldn't start the app.");
    }
    setRunBusy(false);
  }

  async function stopApp() {
    if (runBusy) return;
    setRunBusy(true);
    try {
      await fetch(`/api/workspaces/${workspace.id}/run`, { method: "DELETE" });
      setRun(null);
    } catch {
      // poll will reflect reality
    }
    setRunBusy(false);
  }

  // Check for an existing run when entering the preview tab; poll while the
  // app is coming up (install → start → reachable).
  useEffect(() => {
    if (tab !== "preview" || !isFrameworkApp) return;
    void refreshRun();
  }, [tab, isFrameworkApp, refreshRun]);

  useEffect(() => {
    if (tab !== "preview" || !run) return;
    const busy =
      run.status === "exporting" ||
      run.status === "installing" ||
      run.status === "starting" ||
      (run.status === "running" && !run.reachable);
    if (!busy) return;
    const t = setInterval(() => void refreshRun(), 2500);
    return () => clearInterval(t);
  }, [tab, run, refreshRun]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run?.logs?.length]);

  /* ------------------------------ render ----------------------------- */

  const panel = (
    <div className="glass-panel-strong flex h-full min-h-0 flex-col overflow-hidden">
      {/* Top bar: identity · tabs · actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        {workspace.mode === "IMPORT" ? (
          <FolderGit2 className="h-4 w-4 shrink-0 text-accent" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0 text-ok" />
        )}
        <div className="flex min-w-0 items-center gap-2">
          {workspace.provider !== "github" && PROVIDER_META[workspace.provider as GitProviderName] && (
            <Pill tone="neutral">{PROVIDER_META[workspace.provider as GitProviderName].label}</Pill>
          )}
          <span className="truncate font-mono text-[11px] text-txt2">
            {workspace.repo ?? "scratch workspace"}
          </span>
          {workspace.baseBranch && (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-txt3">
              <GitBranch className="h-3 w-3" />
              {workspace.baseBranch}
            </span>
          )}
          {changedCount > 0 && (
            <button
              type="button"
              onClick={() => setTab("diff")}
              aria-label="View pending changes"
              title="View pending changes"
            >
              <Pill tone="accent">{changedCount} changed</Pill>
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {note && <span className="max-w-[12rem] truncate text-xs text-txt2">{note}</span>}

          {/* Code / Preview tabs */}
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setTab("code")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
                tab === "code"
                  ? "bg-hl text-accent"
                  : "text-txt2 hover:bg-panel2 hover:text-txt",
              )}
            >
              <Code2 className="h-3.5 w-3.5" /> Code
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs transition-colors",
                tab === "preview"
                  ? "bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-ok"
                  : "text-txt2 hover:bg-panel2 hover:text-txt",
              )}
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              type="button"
              onClick={() => setTab("diff")}
              className={cn(
                "inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs transition-colors",
                tab === "diff"
                  ? "bg-hl text-accent"
                  : "text-txt2 hover:bg-panel2 hover:text-txt",
              )}
            >
              <GitCompare className="h-3.5 w-3.5" /> Diff
              {changedCount > 0 && (
                <span className="rounded-full bg-panel3 px-1.5 text-[10px] font-semibold text-txt2">
                  {changedCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("intents")}
              title="Change history — every idea, inspectable and undoable"
              className={cn(
                "inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs transition-colors",
                tab === "intents"
                  ? "bg-hl text-accent"
                  : "text-txt2 hover:bg-panel2 hover:text-txt",
              )}
            >
              <History className="h-3.5 w-3.5" /> Intents
            </button>
          </div>

          {isOwner && (
            <button
              type="button"
              aria-label="Environment"
              title="Environment (setup script & cache)"
              onClick={() => setEnvOpen(true)}
              className="rounded-lg border border-border p-1.5 text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-lg border border-border p-1.5 text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          {isOwner ? (
            <>
              <ShareMenu
                workspaceId={workspace.id}
                currentSpaceId={workspace.spaceId ?? null}
                promptOnMount={isNew}
              />
              <Button
                variant="ghost"
                onClick={() => void save()}
                disabled={!dirtyCount || saving}
                title={
                  dirtyCount
                    ? `Save ${dirtyCount} edited file(s)`
                    : "Everything is saved — AI edits write straight to the workspace. Save is for your own editor changes; Push ships to your repo."
                }
                className="px-3.5 py-1.5"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : dirtyCount ? (
                  <Save className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-ok" />
                )}
                {dirtyCount > 0 ? `Save (${dirtyCount})` : "Saved"}
              </Button>
              <Button onClick={() => setPushing(true)} className="px-3.5 py-1.5">
                <UploadCloud className="h-3.5 w-3.5" />
                Push
              </Button>
            </>
          ) : (
            <Button onClick={() => void forkWorkspace()} disabled={forking} className="px-3.5 py-1.5">
              {forking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Copy to my workspaces
            </Button>
          )}
        </div>
      </div>

      {/* Read-only banner for Space viewers. */}
      {!isOwner && (
        <div className="flex items-center gap-2 border-b border-border bg-panel2/50 px-3 py-2 text-[12px] text-txt2">
          <Eye className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="min-w-0 truncate">
            Viewing {ownerName ? `${ownerName}'s` : "a shared"} workspace — read only. Copy it to edit.
          </span>
        </div>
      )}

      {tab === "code" ? (
        <div className="flex min-h-0 flex-1">
          {/* File tree */}
          <aside className="scroll-area w-60 shrink-0 overflow-y-auto border-r border-border p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="label-tactical">Files</span>
              {isOwner && (
                <button
                  type="button"
                  aria-label="New file"
                  title="New file"
                  onClick={() => {
                    setNewFileOpen(true);
                    setNewFilePath("");
                    setNewFileError(null);
                  }}
                  className="text-txt3 transition-colors hover:text-accent"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {treeError ? (
              <p className="px-2 py-1 text-xs text-warn">{treeError}</p>
            ) : loadingTree ? (
              <p className="flex items-center gap-2 px-2 py-2 text-xs text-txt3">
                <Loader2 className="h-3 w-3 animate-spin" /> loading files…
              </p>
            ) : files.length === 0 ? (
              <p className="px-2 py-1 text-xs text-txt3">
                {isOwner ? "Empty — ask Helix to build something, or add a file." : "This workspace has no files yet."}
              </p>
            ) : (
              <FileTree
                files={files}
                selected={selected}
                dirtyPaths={dirtyPaths}
                importMode={workspace.mode === "IMPORT"}
                onOpen={(p) => void openFile(p)}
                onDelete={(p) => isOwner && void deleteFile(p)}
              />
            )}
          </aside>

          {/* Editor */}
          <div className="flex min-w-0 flex-1 flex-col">
            {selected && (
              <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                <FileCode2 className="h-3.5 w-3.5 text-txt3" />
                <span className="truncate font-mono text-[11px] text-txt2">{selected}</span>
                <button
                  type="button"
                  onClick={() => setLedgerOn((v) => !v)}
                  title="Intent ledger — click any line and ask why it exists"
                  className={cn(
                    "ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors",
                    ledgerOn
                      ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl text-accent"
                      : "border-border text-txt2 hover:border-accent hover:text-txt",
                  )}
                >
                  <ScrollText className="h-3 w-3" /> Ledger
                </button>
              </div>
            )}
            <div className="flex min-h-0 flex-1">
              <div className="relative min-h-0 min-w-0 flex-1">
                {!selected ? (
                  <div className="grid h-full place-items-center px-6 text-center text-sm text-txt3">
                    <div>
                      <p>Select a file to view or edit it.</p>
                      <p className="mt-1 text-xs text-txt3">
                        Files Helix writes appear here the moment a chat turn finishes.
                      </p>
                    </div>
                  </div>
                ) : loadingFile ? (
                  <div className="grid h-full place-items-center text-sm text-txt3">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> loading file…
                    </span>
                  </div>
                ) : (
                  <Monaco
                    key={selected}
                    theme={monacoTheme}
                    language={languageFor(selected)}
                    value={currentContent}
                    onMount={handleEditorMount}
                    onChange={(value) => {
                      const next = value ?? "";
                      setDirty((d) => {
                        if (next !== contents[selected]) return { ...d, [selected]: next };
                        const rest = { ...d };
                        delete rest[selected];
                        return rest;
                      });
                    }}
                    options={{
                      readOnly: !isOwner,
                      fontSize: 13,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      padding: { top: 12 },
                    }}
                  />
                )}
                {popover && selected && ledger?.intents[popover.intentId] && (
                  <IntentPopover
                    workspaceId={workspace.id}
                    path={selected}
                    line={popover.line}
                    intent={ledger.intents[popover.intentId]}
                    position={{ top: popover.top, left: popover.left, placeAbove: popover.placeAbove }}
                    pinned={popover.pinned}
                    isOwner={isOwner}
                    onPin={() => setPopover((p) => (p ? { ...p, pinned: true } : p))}
                    onClose={() => setPopover(null)}
                    onUndo={(i) => {
                      setPopover(null);
                      setUndoIntent(i);
                    }}
                    onMouseEnter={cancelHidePopover}
                    onMouseLeave={scheduleHidePopover}
                  />
                )}
              </div>
              {ledgerOn && selected && !loadingFile && (
                <LedgerPanel
                  workspaceId={workspace.id}
                  path={selected}
                  line={ledgerLine}
                  ledger={ledger}
                  loading={ledgerLoading}
                  hasUnsavedEdits={dirty[selected] !== undefined}
                  isOwner={isOwner}
                  importMode={workspace.mode === "IMPORT"}
                  onUndo={(i) => setUndoIntent(i)}
                />
              )}
            </div>
          </div>
        </div>
      ) : tab === "diff" ? (
        /* Diff tab — pending workspace changes vs the base branch */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <GitCompare className="h-3.5 w-3.5 text-accent" />
            <span className="truncate font-mono text-[11px] text-txt2">
              {diffEntries ? `${diffEntries.length} changed file(s)` : "pending changes"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                aria-label="Reload diff"
                title="Reload diff"
                onClick={() => void loadDiff()}
                className="text-txt3 transition-colors hover:text-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Button
                variant="ghost"
                onClick={() => void runReview()}
                disabled={reviewing || !diffEntries || diffEntries.length === 0}
                className="px-3 py-1.5"
              >
                {reviewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Review changes
              </Button>
            </div>
          </div>

          {review && (
            <div className="scroll-area max-h-56 shrink-0 overflow-y-auto border-b border-border bg-panel2/40 px-4 py-3 text-[12.5px] leading-relaxed text-txt2">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="label-tactical text-[10px]">Review</span>
                <button
                  type="button"
                  onClick={() => setReview(null)}
                  aria-label="Dismiss review"
                  className="ml-auto text-txt3 transition-colors hover:text-txt"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Markdown content={review} />
            </div>
          )}

          {diffLoading && !diffEntries ? (
            <div className="grid flex-1 place-items-center text-sm text-txt3">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> loading diff…
              </span>
            </div>
          ) : diffError ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-warn">
              {diffError}
            </div>
          ) : !diffEntries || diffEntries.length === 0 ? (
            <div className="grid flex-1 place-items-center bg-codebg px-6 text-center">
              <div>
                <GitCompare className="mx-auto mb-3 h-8 w-8 text-txt3" />
                <p className="text-sm text-txt2">No pending changes</p>
                <p className="mt-1 max-w-sm text-xs text-txt3">
                  Edit files or ask Helix to build something.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* Changed-file list */}
              <aside className="scroll-area w-60 shrink-0 overflow-y-auto border-r border-border p-2">
                <div className="px-2 py-1">
                  <span className="label-tactical">Changes</span>
                </div>
                <ul className="space-y-px">
                  {diffEntries.map((e) => {
                    const dot =
                      e.status === "added"
                        ? "bg-ok"
                        : e.status === "deleted"
                          ? "bg-bad"
                          : "bg-warn";
                    return (
                      <li key={e.path}>
                        <button
                          type="button"
                          onClick={() => setDiffSelected(e.path)}
                          title={`${e.status}: ${e.path}`}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                            diffSelected === e.path
                              ? "bg-hl text-txt"
                              : "text-txt2 hover:bg-panel2 hover:text-txt",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
                          <span className="truncate font-mono text-[11px]">{e.path}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              {/* Side-by-side diff editor */}
              <div className="min-w-0 flex-1">
                {diffSelectedEntry ? (
                  <MonacoDiff
                    key={diffSelectedEntry.path}
                    theme={monacoTheme}
                    language={languageFor(diffSelectedEntry.path)}
                    original={diffSelectedEntry.base}
                    modified={diffSelectedEntry.current}
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      fontSize: 13,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      padding: { top: 12 },
                    }}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-txt3">
                    Select a file to view its diff.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : tab === "intents" ? (
        /* Intents tab — the change timeline + intentional undo */
        <IntentsPanel
          workspaceId={workspace.id}
          isOwner={isOwner}
          refreshKey={ledgerNonce}
          onUndo={(i) => setUndoIntent(i)}
        />
      ) : (
        /* Preview tab — framework apps run for real; static sites compose */
        <div className="flex min-h-0 flex-1 flex-col">
          {isFrameworkApp ? (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                <MonitorPlay className="h-3.5 w-3.5 text-ok" />
                <span className="truncate font-mono text-[11px] text-txt2">
                  {run?.framework || "framework app"}
                  {run && (
                    <span
                      className={cn(
                        "ml-2",
                        run.status === "running" && run.reachable ? "text-ok" : "text-warn",
                      )}
                    >
                      · {run.status === "running" && !run.reachable ? "starting" : run.status}
                    </span>
                  )}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {run?.url && run.reachable && (
                    <a
                      href={run.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-ok transition-colors hover:brightness-110"
                    >
                      {run.port ? `:${run.port}` : "open preview"} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {run && run.status !== "stopped" && run.status !== "error" ? (
                    <button
                      type="button"
                      onClick={() => void stopApp()}
                      disabled={runBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--red)_40%,transparent)] px-2.5 py-1 text-[11px] text-bad transition-colors hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)] disabled:opacity-50"
                    >
                      <Square className="h-3 w-3" /> Stop
                    </button>
                  ) : (
                    <Button
                      onClick={() => void startApp()}
                      disabled={runBusy}
                      className="px-3 py-1 text-[11px]"
                    >
                      {runBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Run app
                    </Button>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {run?.url && run.reachable ? (
                  <div className="flex h-full flex-col">
                    <iframe
                      title="App preview"
                      src={run.url}
                      className="min-h-0 w-full flex-1 bg-white"
                    />
                    {/* Apps that send X-Frame-Options / frame-ancestors refuse
                        to render in ANY iframe — give them a way out. */}
                    <div className="flex items-center justify-center gap-1.5 border-t border-border bg-panel2/40 px-3 py-1.5 text-[11px] text-txt3">
                      <span>Showing &ldquo;refused to connect&rdquo;? The app blocks embedding —</span>
                      <a
                        href={run.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-accent transition-colors hover:brightness-110"
                      >
                        open it in a new tab <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ) : run && run.status !== "stopped" ? (
                  /* booting / installing / error → live logs */
                  <div className="flex h-full flex-col bg-codebg">
                    <div className="flex items-center gap-2 px-4 py-2 text-xs text-txt2">
                      {run.status !== "error" && <Loader2 className="h-3.5 w-3.5 animate-spin text-ok" />}
                      {run.status === "exporting" && "exporting workspace files…"}
                      {run.status === "installing" &&
                        (run.port
                          ? "installing dependencies (first run can take a few minutes)…"
                          : "starting a cloud VM and installing dependencies (a minute or two)…")}
                      {(run.status === "starting" || (run.status === "running" && !run.reachable)) &&
                        "starting the dev server…"}
                      {run.status === "error" && <span className="text-bad">the app crashed — logs below</span>}
                    </div>
                    <pre className="scroll-area flex-1 overflow-y-auto whitespace-pre-wrap px-4 pb-4 font-mono text-[10px] leading-relaxed text-txt3">
                      {run.logs.join("\n")}
                      <div ref={logsEndRef} />
                    </pre>
                  </div>
                ) : (
                  <div className="grid h-full place-items-center bg-codebg px-6 text-center">
                    <div>
                      <MonitorPlay className="mx-auto mb-3 h-8 w-8 text-txt3" />
                      <p className="text-sm text-txt2">This is a framework app — run it to preview.</p>
                      <p className="mt-1 max-w-sm text-xs text-txt3">
                        Helix installs dependencies and starts the dev server — locally in dev, in a
                        cloud VM with a shareable preview link on the hosted site (auto-stops after
                        ~15 minutes). Hit <span className="text-txt2">Run app</span> above.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                <MonitorPlay className="h-3.5 w-3.5 text-ok" />
                <span className="truncate font-mono text-[11px] text-txt2">
                  {previewInfo ?? "live preview"}
                </span>
                <button
                  type="button"
                  aria-label="Reload preview"
                  title="Reload preview"
                  onClick={() => setPreviewNonce((n) => n + 1)}
                  className="ml-auto text-txt3 transition-colors hover:text-ok"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 bg-white">
                {previewHtml ? (
                  <iframe
                    key={previewNonce}
                    title="Live preview"
                    sandbox="allow-scripts"
                    srcDoc={previewHtml}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="grid h-full place-items-center bg-codebg px-6 text-center">
                    <div>
                      <MonitorPlay className="mx-auto mb-3 h-8 w-8 text-txt3" />
                      <p className="text-sm text-txt2">
                        {previewEntry ? (previewInfo ?? "composing preview…") : "No HTML page to preview yet."}
                      </p>
                      <p className="mt-1 max-w-sm text-xs text-txt3">
                        The preview runs the workspace&apos;s index.html (or the HTML file you have open)
                        with its CSS/JS inlined. Ask Helix to build a page and it appears here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* New file modal */}
      {newFileOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md"
          onClick={() => setNewFileOpen(false)}
        >
          <div
            className="fade-up w-full max-w-sm rounded-card-lg border border-border2 bg-panel p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <FilePlus2 className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-medium text-txt">New file</h2>
              <button
                type="button"
                onClick={() => setNewFileOpen(false)}
                aria-label="Close"
                className="ml-auto text-txt3 transition-colors hover:text-txt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createFile();
              }}
            >
              <label className="label-tactical mb-1.5 block">
                File path
              </label>
              <input
                autoFocus
                value={newFilePath}
                onChange={(e) => {
                  setNewFilePath(e.target.value);
                  setNewFileError(null);
                }}
                placeholder="src/components/button.tsx"
                className="w-full rounded-lg border border-border2 bg-bg2 px-3 py-2 font-mono text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
              />
              {newFileError && <p className="mt-1.5 text-[11px] text-warn">{newFileError}</p>}
              <p className="mt-1.5 text-[10px] text-txt3">
                Folders are created automatically from the path.
              </p>
              <Button
                type="submit"
                disabled={!newFilePath.trim()}
                className="mt-3 w-full justify-center"
              >
                Create file
              </Button>
            </form>
          </div>
        </div>
      )}

      <UndoDialog
        workspaceId={workspace.id}
        intent={undoIntent}
        monacoTheme={monacoTheme}
        onClose={() => setUndoIntent(null)}
        onApplied={(c) => {
          applyChangesManifest(c.written, c.deleted);
          setNote(
            [
              c.written.length ? `undo restored ${c.written.length} file(s)` : null,
              c.deleted.length ? `removed ${c.deleted.length}` : null,
            ]
              .filter(Boolean)
              .join(", ") || "undo applied",
          );
          if (tab === "diff") void loadDiff();
        }}
      />

      {envOpen && <EnvDialog workspaceId={workspace.id} onClose={() => setEnvOpen(false)} />}
      {pushing && (
        <PushDialog
          workspace={workspace}
          dirtyCount={dirtyCount}
          isGuest={isGuest}
          onClose={() => setPushing(false)}
        />
      )}
    </div>
  );

  if (fullscreen) {
    return <div className="fixed inset-0 z-40 bg-bg p-3">{panel}</div>;
  }
  return panel;
}
