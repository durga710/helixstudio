"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderUp, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useShell } from "./shell-context";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.2.48-2.67-1.06-2.67-1.06-.36-.92-.88-1.16-.88-1.16-.72-.49.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.21 1.86.86 2.31.66.07-.52.28-.86.5-1.06-1.75-.2-3.6-.88-3.6-3.9 0-.86.31-1.56.82-2.11-.08-.2-.36-1 .08-2.09 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.01 2.2-.8 2.2-.8.44 1.09.16 1.89.08 2.09.51.55.82 1.25.82 2.11 0 3.03-1.85 3.7-3.61 3.89.29.24.54.72.54 1.45v2.15c0 .21.15.45.55.38A8 8 0 0 0 8 0z" />
    </svg>
  );
}

const optionClass =
  "flex gap-3.5 rounded-card border border-border2 bg-panel2 p-3.5 text-left transition-colors hover:border-accent";

export function NewProjectModal() {
  const { newProjectOpen, setNewProjectOpen } = useShell();
  const { toast } = useToast();
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("github.com/durga710/ChatDPS");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importRepo() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Import failed (${res.status})`);
      }
      const data = (await res.json()) as { indexed?: number };
      setNewProjectOpen(false);
      toast(`Indexed ${data.indexed ?? 0} files — workspace ready`);
      router.push("/editor");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
      <DialogContent>
        <DialogHeader
          title="New project"
          description="Import an existing repository or start from a blank workspace."
        />
        <div className="flex flex-col gap-2.5 p-5">
          <div className={optionClass}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
              <GitHubMark className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h5 className="text-[13px] font-semibold">Import from GitHub</h5>
              <p className="mt-0.5 text-xs text-txt2">Index a repo so Helix understands the whole codebase.</p>
              <div className="mt-2.5 flex gap-2">
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  aria-label="Repository URL"
                  className="w-full rounded-card-sm border border-border2 bg-panel px-2.5 py-1.5 font-mono text-xs text-txt outline-none focus:border-accent"
                />
              </div>
              {error && <p className="mt-1.5 text-xs text-bad">{error}</p>}
            </div>
          </div>
          <button className={`${optionClass} cursor-pointer`} onClick={() => toast("Folder upload arrives with local indexing")}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
              <FolderUp className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <div>
              <h5 className="text-[13px] font-semibold">Upload a folder</h5>
              <p className="mt-0.5 text-xs text-txt2">Drag in a local project to analyze offline.</p>
            </div>
          </button>
          <button
            className={`${optionClass} cursor-pointer`}
            onClick={() => {
              setRepoUrl("github.com/acme/new-app");
              toast("Scaffold: Next.js · TypeScript · Tailwind · shadcn/ui");
            }}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
              <Plus className="h-4 w-4" strokeWidth={1.7} />
            </div>
            <div>
              <h5 className="text-[13px] font-semibold">Start from scratch</h5>
              <p className="mt-0.5 text-xs text-txt2">Scaffold a new Next.js · TypeScript · Tailwind · shadcn/ui app.</p>
            </div>
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" onClick={() => setNewProjectOpen(false)}>
            Cancel
          </Button>
          <Button onClick={importRepo} disabled={importing || repoUrl.trim().length < 4}>
            {importing ? "Importing…" : "Import & index"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
