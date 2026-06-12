"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GitProviderName } from "@/lib/git/meta";

/**
 * The three ways a workspace is born — create from scratch, import from a
 * git host, upload a local folder — shared by the editor landing page
 * (StudioHome) and the global "Start new project" modal so the flows can't
 * drift apart. Navigates to /editor/[id] on success.
 */

/* ------------------------- folder import rules ------------------------- */

// Vendored/build dirs never worth uploading — same spirit as the repo
// importers' SKIP list (src/lib/git/github.ts).
const SKIP_DIRS = /(^|\/)(node_modules|dist|build|out|coverage|vendor|__pycache__|\.git|\.next|\.venv|\.idea|\.vscode|\.cache)(\/|$)/;
const BINARY_EXT = /\.(png|jpe?g|gif|ico|webp|svgz|pdf|zip|gz|tar|7z|rar|woff2?|ttf|eot|otf|mp[34]|mov|avi|webm|exe|dll|so|dylib|bin|jar|class|pyc|wasm|sqlite|db)$/i;
// Server-side caps (src/lib/repo-files.ts): 48k chars/file, 60 files and
// 512k chars per save call, 400 overlay rows per workspace.
const MAX_FILE_CHARS = 48_000;
const MAX_IMPORT_FILES = 300;
const BATCH_FILES = 50;
const BATCH_CHARS = 400_000;

export function useWorkspaceCreation(onNavigate?: () => void) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  function go(workspaceId: string) {
    onNavigate?.();
    router.push(`/editor/${workspaceId}`);
  }

  async function createScratch(name: string): Promise<void> {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "SCRATCH", ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Couldn't create the workspace.");
      } else {
        go(json.data.id);
        return;
      }
    } catch {
      setError("Network error. Try again.");
    }
    setCreating(false);
  }

  /** Returns false on failure so callers can close/reset their pickers. */
  async function importRepo(provider: GitProviderName, repo: string): Promise<boolean> {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "IMPORT", repo, provider }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Couldn't import the repo.");
        setCreating(false);
        return false;
      }
      go(json.data.id);
      return true;
    } catch {
      setError("Network error. Try again.");
      setCreating(false);
      return false;
    }
  }

  /**
   * Import from folder: the user picks a local project directory (e.g. an
   * app they built with Claude Code on their machine); its text files are
   * uploaded into a fresh workspace, which can then run live and push to
   * any connected git host.
   */
  async function importFolder(fileList: FileList): Promise<void> {
    if (creating) return;
    setCreating(true);
    setError(null);

    try {
      const all = Array.from(fileList);
      // webkitRelativePath = "myapp/src/index.ts" — folder name names the
      // workspace and is stripped from the stored paths.
      const folderName = all[0]?.webkitRelativePath.split("/")[0] ?? "imported-app";

      let skipped = 0;
      const files: { path: string; content: string }[] = [];
      for (const f of all) {
        const path = f.webkitRelativePath.split("/").slice(1).join("/");
        if (
          !path ||
          path.length > 200 ||
          SKIP_DIRS.test(path) ||
          BINARY_EXT.test(path) ||
          !/^[\w./ -]+$/.test(path) ||
          f.size > MAX_FILE_CHARS * 4
        ) {
          skipped++;
          continue;
        }
        const content = await f.text();
        if (!content.trim() || content.includes("\u0000") || content.length > MAX_FILE_CHARS) {
          skipped++;
          continue;
        }
        files.push({ path, content });
        if (files.length >= MAX_IMPORT_FILES) break;
      }

      if (files.length === 0) {
        setError("No importable text files found in that folder (binaries and vendored dirs are skipped).");
        setCreating(false);
        return;
      }

      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "SCRATCH", name: folderName.slice(0, 60) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Couldn't create the workspace.");
        setCreating(false);
        return;
      }
      const wsId = json.data.id as string;

      // Upload in batches under the save API's per-call limits.
      let sent = 0;
      while (sent < files.length) {
        const batch: typeof files = [];
        let chars = 0;
        while (sent < files.length && batch.length < BATCH_FILES && chars < BATCH_CHARS) {
          batch.push(files[sent]);
          chars += files[sent].content.length;
          sent++;
        }
        setUploadNote(`Uploading ${sent}/${files.length} files…`);
        const save = await fetch(`/api/workspaces/${wsId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: batch }),
        });
        const saveJson = await save.json().catch(() => null);
        if (!save.ok || !saveJson?.ok) {
          setError(
            `${saveJson?.error?.message ?? "Upload failed"} — ${sent - batch.length} of ${files.length} files made it; the workspace is in your editor list.`,
          );
          setUploadNote(null);
          setCreating(false);
          router.refresh();
          return;
        }
      }

      if (skipped > 0) setUploadNote(`Imported ${files.length} files (${skipped} binary/vendored skipped).`);
      go(wsId);
    } catch {
      setError("Couldn't read that folder. Try again.");
      setUploadNote(null);
      setCreating(false);
    }
  }

  return { creating, error, setError, uploadNote, createScratch, importRepo, importFolder };
}
