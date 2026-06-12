/* eslint-disable react-hooks/set-state-in-effect -- ported GCODE studio code; its fetch-on-mount/poll effects predate this rule and behave correctly */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Code2,
  Copy,
  Eye,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FolderGit2,
  GitBranch,
  GitCompare,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  const { toast } = useToast();
  const [forking, setForking] = useState(false);
  const [files, setFiles] = useState<TreeFile[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [loadingFile, setLoadingFile] = useState(false);

  const [tab, setTab] = useState<"code" | "preview" | "diff">("code");
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
    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/files`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setTreeError(json?.error?.message ?? "Couldn't load the workspace files.");
      } else {
        setFiles(json.data.files);
      }
    } catch {
      setTreeError("Couldn't load the workspace files.");
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

  // AI changes from the chat turn: merge new paths into the tree, invalidate
  // their cached content, refresh the open file, drop deleted paths.
  useEffect(() => {
    if (!changes) return;
    const { written, deleted } = changes;

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
    setNote(
      [
        written.length ? `AI wrote ${written.length} file(s)` : null,
        deleted.length ? `deleted ${deleted.length}` : null,
      ]
        .filter(Boolean)
        .join(", "),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes?.nonce]);

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
  const previewEntry = useMemo(() => {
    const htmlFiles = files.filter((f) => f.path.toLowerCase().endsWith(".html"));
    if (selected?.toLowerCase().endsWith(".html")) return selected;
    return (
      htmlFiles.find((f) => f.path === "index.html")?.path ??
      htmlFiles.find((f) => /(^|\/)index\.html$/.test(f.path))?.path ??
      htmlFiles[0]?.path ??
      null
    );
  }, [files, selected]);

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

      let html = await getFile(previewEntry);
      if (seq !== composeSeq.current) return;
      if (html === null) {
        setPreviewHtml(null);
        setPreviewInfo("Couldn't load the page.");
        return;
      }

      const baseDir = previewEntry.includes("/")
        ? previewEntry.slice(0, previewEntry.lastIndexOf("/") + 1)
        : "";
      const resolve = (ref: string) => {
        let p = ref.startsWith("./") ? ref.slice(2) : ref;
        if (p.startsWith("/")) p = p.slice(1);
        else p = baseDir + p;
        return p;
      };
      const isLocalRef = (ref: string) =>
        Boolean(ref) && !/^([a-z]+:)?\/\//i.test(ref) && !ref.startsWith("data:") && !ref.startsWith("#");

      const inlined: string[] = [];

      // <link rel="stylesheet" href="style.css"> → <style>…</style>
      const linkRe = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
      const links = Array.from(html.matchAll(linkRe)).filter(
        (m) => /stylesheet/i.test(m[0]) && isLocalRef(m[1]),
      );
      for (const m of links) {
        const css = await getFile(resolve(m[1]));
        if (seq !== composeSeq.current) return;
        if (css !== null) {
          html = html.replace(m[0], `<style>\n${css}\n</style>`);
          inlined.push(m[1]);
        }
      }

      // <script src="app.js"></script> → <script>…</script>
      const scriptRe = /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
      const scripts = Array.from(html.matchAll(scriptRe)).filter((m) => isLocalRef(m[1]));
      for (const m of scripts) {
        const js = await getFile(resolve(m[1]));
        if (seq !== composeSeq.current) return;
        if (js !== null) {
          html = html.replace(m[0], `<script>\n${js}\n</script>`);
          inlined.push(m[1]);
        }
      }

      setPreviewHtml(html);
      setPreviewInfo(
        `${previewEntry}${inlined.length ? ` + ${inlined.length} inlined asset(s)` : ""}`,
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
              <ShareMenu workspaceId={workspace.id} currentSpaceId={workspace.spaceId ?? null} />
              <Button
                variant="ghost"
                onClick={() => void save()}
                disabled={!dirtyCount || saving}
                className="px-3.5 py-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
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
              </div>
            )}
            <div className="min-h-0 flex-1">
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
                  <iframe
                    title="App preview"
                    src={run.url}
                    className="h-full w-full bg-white"
                  />
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
