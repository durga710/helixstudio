"use client";

import { useEffect, useState } from "react";
import { GitBranch, Pencil, Save, X, Zap } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { tokenizeLine } from "@/lib/highlight";
import type { SourceFile } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Diff decorations for the sample workspace — line numbers with added (+)
 * or highlighted treatment, keyed by path. */
const DECORATIONS: Record<string, { add?: number[]; hl?: number[] }> = {
  "app/api/invites.ts": { add: [6, 7, 8, 9, 10], hl: [11] },
  "app/api/orders.ts": { hl: [7] },
  "app/components/DataTable.tsx": { hl: [6] },
};

export function CodeView({ file, onSaved }: { file: SourceFile | null; onSaved?: (path: string, content: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Leave edit mode when switching files.
  const path = file?.path;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient edit state on file switch
    setEditing(false);
  }, [path]);

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
      setEditing(false);
      toast(`Saved ${file.path}`);
    } catch {
      toast("Save failed — try again");
    } finally {
      setSaving(false);
    }
  }

  const editBar = (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-bg2 px-3 py-1.5">
      <span className="font-mono text-[11px] text-txt3">{file.path}</span>
      {editing ? (
        <>
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_13%,transparent)] px-2 py-0.5 text-[11px] text-ok disabled:opacity-50"
          >
            <Save className="h-3 w-3" strokeWidth={2} />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-border2 bg-panel2 px-2 py-0.5 text-[11px] text-txt2 hover:text-txt"
          >
            <X className="h-3 w-3" strokeWidth={2} />
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={() => {
            setDraft(file.content);
            setEditing(true);
          }}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-md border border-border2 bg-panel2 px-2 py-0.5 text-[11px] text-txt2 hover:border-accent hover:text-txt"
        >
          <Pencil className="h-3 w-3" strokeWidth={2} />
          Edit
        </button>
      )}
    </div>
  );

  if (editing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-codebg">
        {editBar}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label={`Edit ${file.path}`}
          className="code-font scroll-area min-h-0 flex-1 resize-none border-none bg-codebg px-[46px] py-3.5 font-mono leading-[1.7] text-txt outline-none"
        />
      </div>
    );
  }

  const deco = DECORATIONS[file.path] ?? {};
  const lines = file.content.replace(/\n$/, "").split("\n");

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-codebg">
      {editBar}
      <div className="code-font scroll-area flex-1 overflow-auto py-3.5 font-mono leading-[1.7]">
      {lines.map((line, i) => {
        const n = i + 1;
        const isAdd = deco.add?.includes(n);
        const isHl = deco.hl?.includes(n);
        return (
          <div
            key={n}
            className={cn(
              "flex",
              isAdd && "bg-[color-mix(in_srgb,var(--green)_9%,transparent)]",
              isHl && "bg-hl"
            )}
          >
            <span
              className={cn(
                "w-[46px] shrink-0 select-none pr-4 text-right text-txt3",
                isAdd ? "text-ok opacity-100" : "opacity-70"
              )}
            >
              {n}
            </span>
            <span className="whitespace-pre pr-6">
              {tokenizeLine(line).map((tok, j) =>
                tok.cls ? (
                  <span key={j} className={`tok-${tok.cls}`}>
                    {tok.text}
                  </span>
                ) : (
                  tok.text
                )
              )}
            </span>
          </div>
        );
      })}
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
      <span>Ln 11, Col 42</span>
      <span>UTF-8</span>
      <span className="ml-auto inline-flex items-center gap-[5px] text-accent">
        <Zap className="h-3 w-3" strokeWidth={1.7} />
        Helix connected
      </span>
    </div>
  );
}
