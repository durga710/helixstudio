"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { GitBranch, Save, Zap } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/components/theme-provider";
import type { SourceFile } from "@/lib/types";

/* Monaco-based editor (ported from gcode's workspace panel): a real code
 * editor with language detection, live dirty tracking, and multi-file save.
 * Loaded client-only — Monaco can't render on the server. */

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-codebg p-4 text-[13px] text-txt3">Loading editor…</div>,
});

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", css: "css", scss: "scss", html: "html", md: "markdown", mdx: "markdown", py: "python",
  go: "go", rs: "rust", java: "java", rb: "ruby", php: "php", c: "c", h: "c", cpp: "cpp", cs: "csharp",
  sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml", sql: "sql", prisma: "prisma", toml: "ini",
};

function monacoLang(path: string): string {
  if (path.endsWith("Dockerfile")) return "dockerfile";
  const ext = path.includes(".") ? path.split(".").pop()!.toLowerCase() : "";
  return LANG[ext] ?? "plaintext";
}

interface MonacoViewProps {
  file: SourceFile | null;
  onSaved?: (path: string, content: string) => void;
}

export function MonacoView({ file, onSaved }: MonacoViewProps) {
  const [draft, setDraft] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { theme } = useTheme();
  const { toast } = useToast();

  // Sync the editor buffer to whichever file is open. Keyed on path+content so
  // switching files (or an AI/save updating the active file) reloads the buffer.
  const fileKey = `${file?.path ?? ""}::${file?.content ?? ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (fileKey !== loadedKey) {
    setLoadedKey(fileKey);
    setDraft(file?.content ?? "");
    setDirty(false);
  }

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center bg-codebg text-[13px] text-txt3">
        No file open — pick one from the explorer.
      </div>
    );
  }

  async function save() {
    if (!file) return;
    setSaving(true);
    try {
      const res = await fetch("/api/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, content: draft }),
      });
      if (!res.ok) throw new Error();
      onSaved?.(file.path, draft);
      setDirty(false);
      toast(`Saved ${file.path}`);
    } catch {
      toast("Save failed — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-codebg">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg2 px-3 py-1.5">
        <span className="font-mono text-[11px] text-txt3">{file.path}</span>
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Unsaved changes" />}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_13%,transparent)] px-2 py-0.5 text-[11px] text-ok disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-3 w-3" strokeWidth={2} />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <MonacoEditor
          path={file.path}
          language={monacoLang(file.path)}
          theme={theme === "light" ? "light" : "vs-dark"}
          value={draft}
          onChange={(v) => {
            const next = v ?? "";
            setDraft(next);
            setDirty(next !== file.content);
          }}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            automaticLayout: true,
            padding: { top: 12 },
            scrollBeyondLastLine: false,
            tabSize: 2,
            fontFamily: "var(--font-mono)",
          }}
        />
      </div>
    </div>
  );
}

export function EditorStatusBar({ file }: { file: SourceFile | null }) {
  return (
    <div className="flex h-[25px] shrink-0 items-center gap-3.5 border-t border-border bg-bg2 px-[13px] text-[11px] text-txt2">
      <span className="inline-flex items-center gap-[5px]">
        <GitBranch className="h-3 w-3" strokeWidth={1.7} />
        main
      </span>
      <span>{file?.language ?? ""}</span>
      <span>UTF-8</span>
      <span className="ml-auto inline-flex items-center gap-[5px] text-accent">
        <Zap className="h-3 w-3" strokeWidth={1.7} />
        Monaco · Helix connected
      </span>
    </div>
  );
}
