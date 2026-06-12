"use client";

import { useRef, useState } from "react";
import { FilePlus2, FolderGit2, GitBranch, Loader2, UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useShell } from "./shell-context";
import { RepoPicker } from "@/components/studio/repo-picker";
import { GitHostPicker } from "@/components/studio/git-host-picker";
import { useWorkspaceCreation } from "@/components/studio/use-workspace-creation";

/**
 * "Start new project" — the global entry point in the top bar. Same four
 * doors as the editor landing page (shared flows via useWorkspaceCreation):
 * scratch, GitHub, other git hosts, local folder.
 */
export function NewProjectModal() {
  const { newProjectOpen, setNewProjectOpen } = useShell();
  const [namePrompt, setNamePrompt] = useState(false);
  const [scratchName, setScratchName] = useState("");
  // The repo pickers are full-screen overlays of their own — the dialog
  // hides while one is up and comes back if the user backs out.
  const [picker, setPicker] = useState<"github" | "host" | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { creating, error, setError, uploadNote, createScratch, importRepo, importFolder } =
    useWorkspaceCreation(() => {
      setPicker(null);
      setNewProjectOpen(false);
    });

  function reset() {
    setNamePrompt(false);
    setScratchName("");
    setError(null);
  }

  const door =
    "group flex cursor-pointer flex-col gap-2.5 rounded-card border border-border2 bg-panel2 p-4 text-left transition-colors hover:border-accent disabled:opacity-60";

  return (
    <>
      <Dialog
        open={newProjectOpen && picker === null}
        onOpenChange={(open) => {
          setNewProjectOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="w-[min(640px,94vw)]">
          <DialogHeader
            title="Start new project"
            description="Build from a prompt, your repos, or a folder on your computer."
          />

          <div className="grid gap-2.5 p-5 sm:grid-cols-2">
            {/* Create from scratch — div+role so the name form can nest */}
            <div
              role="button"
              tabIndex={0}
              className={door}
              onClick={() => !namePrompt && !creating && setNamePrompt(true)}
              onKeyDown={(e) => e.key === "Enter" && !namePrompt && !creating && setNamePrompt(true)}
            >
              <span className="grid h-9 w-9 place-items-center rounded-[9px] border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_12%,transparent)]">
                <FilePlus2 className="h-4 w-4 text-ok" strokeWidth={1.7} />
              </span>
              <span>
                <h5 className="text-[13px] font-semibold text-txt">Create from scratch</h5>
                <p className="mt-0.5 text-xs leading-relaxed text-txt2">
                  Start empty. Describe what you want; files appear as Helix writes them.
                </p>
              </span>
              {namePrompt && (
                <form
                  className="flex w-full gap-2"
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createScratch(scratchName);
                  }}
                >
                  <input
                    autoFocus
                    value={scratchName}
                    onChange={(e) => setScratchName(e.target.value)}
                    placeholder="Project name (optional)"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-bg2 px-2.5 py-1.5 text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
                  />
                  <Button type="submit" disabled={creating}>
                    {creating && !uploadNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
                  </Button>
                </form>
              )}
            </div>

            {/* Import from GitHub */}
            <button type="button" className={door} disabled={creating} onClick={() => setPicker("github")}>
              <span className="grid h-9 w-9 place-items-center rounded-[9px] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                <FolderGit2 className="h-4 w-4 text-accent" strokeWidth={1.7} />
              </span>
              <span>
                <h5 className="text-[13px] font-semibold text-txt">Import from GitHub</h5>
                <p className="mt-0.5 text-xs leading-relaxed text-txt2">
                  Pick one of your repos — private included. Edit with Helix, push back as a branch or PR.
                </p>
              </span>
            </button>

            {/* Import from another git host */}
            <button type="button" className={door} disabled={creating} onClick={() => setPicker("host")}>
              <span className="grid h-9 w-9 place-items-center rounded-[9px] border border-border2 bg-panel">
                <GitBranch className="h-4 w-4 text-txt2" strokeWidth={1.7} />
              </span>
              <span>
                <h5 className="text-[13px] font-semibold text-txt">Import from another Git host</h5>
                <p className="mt-0.5 text-xs leading-relaxed text-txt2">
                  GitLab, Bitbucket, Azure DevOps, Gitea/Codeberg — connect with a token and import.
                </p>
              </span>
            </button>

            {/* Import from folder */}
            <button
              type="button"
              className={door}
              disabled={creating}
              onClick={() => folderInputRef.current?.click()}
            >
              <span className="grid h-9 w-9 place-items-center rounded-[9px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]">
                {uploadNote && creating ? (
                  <Loader2 className="h-4 w-4 animate-spin text-warn" />
                ) : (
                  <UploadCloud className="h-4 w-4 text-warn" strokeWidth={1.7} />
                )}
              </span>
              <span>
                <h5 className="text-[13px] font-semibold text-txt">Import from folder</h5>
                <p className="mt-0.5 text-xs leading-relaxed text-txt2">
                  {uploadNote ?? "Upload a project from your computer — run it live, then push it to a repo."}
                </p>
              </span>
            </button>
          </div>

          {error && <p className="px-5 pb-4 text-xs text-warn">{error}</p>}
        </DialogContent>
      </Dialog>

      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        aria-label="Choose a project folder to import"
        // @ts-expect-error — webkitdirectory is a non-standard but universally supported attribute
        webkitdirectory=""
        multiple
        onChange={(e) => {
          if (e.target.files?.length) void importFolder(e.target.files);
          e.target.value = "";
        }}
      />

      {newProjectOpen && picker === "github" && (
        <RepoPicker
          busy={creating}
          onSelect={(repo) => void importRepo("github", repo)}
          onClose={() => setPicker(null)}
        />
      )}
      {newProjectOpen && picker === "host" && (
        <GitHostPicker
          busy={creating}
          onSelect={(provider, repo) => void importRepo(provider, repo)}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
