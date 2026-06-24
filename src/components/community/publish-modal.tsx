"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";

type Tab = "app" | "video";
type Ws = { id: string; name: string; kind: string };

/** Publish one of your projects (an app workspace) or a video link to the
 * community. onClose(true) signals a successful publish so the gallery reloads. */
export function PublishModal({ onClose }: { onClose: (published?: boolean) => void }) {
  const [tab, setTab] = useState<Tab>("app");
  const [workspaces, setWorkspaces] = useState<Ws[] | null>(null);
  const [wsId, setWsId] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workspaces", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          const list = (json.data.workspaces as Ws[]).filter((w) => w.kind !== "game");
          setWorkspaces(list);
        } else setWorkspaces([]);
      } catch {
        setWorkspaces([]);
      }
    })();
  }, []);

  function pickWorkspace(w: Ws) {
    setWsId(w.id);
    if (!title.trim()) setTitle(w.name);
  }

  async function submit() {
    setError(null);
    const body =
      tab === "app"
        ? { kind: "app", workspaceId: wsId, title: title.trim() || undefined, description: description.trim() || undefined }
        : { kind: "video", embedUrl: embedUrl.trim(), title: title.trim(), description: description.trim() || undefined };
    if (tab === "app" && !wsId) return setError("Pick a project to publish.");
    if (tab === "video" && !embedUrl.trim()) return setError("Paste a YouTube, Vimeo, or Loom link.");
    if (!title.trim()) return setError("Add a title.");
    setBusy(true);
    try {
      const res = await fetch("/api/community/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        onClose(true);
        return;
      }
      setError(json?.error?.message ?? "Couldn't publish. Try again.");
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => onClose()}>
      <div className="w-full max-w-[480px] rounded-2xl border border-border2 bg-panel p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-txt">
            <Compass className="h-4 w-4 text-accent" /> Publish to Community
          </h2>
          <button type="button" onClick={() => onClose()} className="text-txt3 transition-colors hover:text-txt">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Segmented<Tab>
          options={[
            { value: "app", label: "An app" },
            { value: "video", label: "A video" },
          ]}
          value={tab}
          onChange={setTab}
          aria-label="What to publish"
          className="mb-4"
        />

        {tab === "app" ? (
          <div className="mb-3">
            <label className="mb-1.5 block text-[12px] font-medium text-txt2">Project</label>
            {workspaces === null ? (
              <div className="flex items-center gap-2 py-3 text-[12.5px] text-txt3">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your projects…
              </div>
            ) : workspaces.length === 0 ? (
              <p className="py-2 text-[12.5px] text-txt3">No projects to publish yet — build one in the editor first.</p>
            ) : (
              <div className="max-h-[160px] space-y-1 overflow-y-auto rounded-lg border border-border2 p-1">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => pickWorkspace(w)}
                    className={
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors " +
                      (wsId === w.id ? "bg-hl text-accent" : "text-txt2 hover:bg-panel2")
                    }
                  >
                    <span className="line-clamp-1">{w.name}</span>
                    {wsId === w.id && <span className="text-[11px]">Selected</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-3">
            <label className="mb-1.5 block text-[12px] font-medium text-txt2">Video link</label>
            <Input
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=…  (YouTube, Vimeo, or Loom)"
            />
          </div>
        )}

        <label className="mb-1.5 block text-[12px] font-medium text-txt2">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name your project" className="mb-3" maxLength={120} />

        <label className="mb-1.5 block text-[12px] font-medium text-txt2">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short description (optional)"
          rows={3}
          maxLength={2000}
          className="mb-3"
        />

        {error && <p className="mb-3 text-xs text-warn">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onClose()} className="rounded-lg px-3 py-2 text-[13px] text-txt2 transition-colors hover:text-txt">
            Cancel
          </button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
