"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Compass, Check } from "lucide-react";
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

  // Video tab: optionally link a saved reel (the "editing space") + opt-ins.
  const [videoProjects, setVideoProjects] = useState<{ id: string; title: string }[] | null>(null);
  const [videoProjectId, setVideoProjectId] = useState("");
  const [revealRecipe, setRevealRecipe] = useState(true);
  const [allowRemix, setAllowRemix] = useState(true);

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
    (async () => {
      try {
        const res = await fetch("/api/video/projects", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        setVideoProjects(res.ok && json?.ok ? (json.data.projects as { id: string; title: string }[]) : []);
      } catch {
        setVideoProjects([]);
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
        : {
            kind: "video",
            embedUrl: embedUrl.trim(),
            title: title.trim(),
            description: description.trim() || undefined,
            videoProjectId: videoProjectId || undefined,
            revealRecipe: videoProjectId ? revealRecipe : undefined,
            allowRemix: videoProjectId ? allowRemix : undefined,
          };
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
          <div className="mb-3 space-y-3">
            {/* We don't host the video file — the creator uploads it, then pastes
                the link, which we embed. Make those steps unmistakable. */}
            <div className="rounded-lg border border-border2 bg-panel2/50 p-3 text-[12px] leading-relaxed">
              <p className="mb-1.5 font-medium text-txt">Made it in the HelixVideo editor?</p>
              <ol className="list-inside list-decimal space-y-0.5 text-txt3">
                <li>
                  Export your reel and upload it to{" "}
                  <span className="text-txt2">YouTube, Vimeo, or Loom</span>.
                </li>
                <li>Paste the share link below — it plays right here on the page.</li>
                <li>Optionally link the saved reel so others can see (and remix) how you made it.</li>
              </ol>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-txt2">Video link</label>
              <Input
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=…  (YouTube, Vimeo, or Loom)"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-txt2">
                Link a saved reel <span className="text-txt3">(optional)</span>
              </label>
              {videoProjects === null ? (
                <div className="flex items-center gap-2 py-1.5 text-[12.5px] text-txt3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your reels…
                </div>
              ) : videoProjects.length === 0 ? (
                <p className="text-[12px] text-txt3">
                  No saved reels yet — open the Video Editor, build a reel, and hit Save.
                </p>
              ) : (
                <select
                  value={videoProjectId}
                  onChange={(e) => {
                    setVideoProjectId(e.target.value);
                    const p = videoProjects.find((v) => v.id === e.target.value);
                    if (p && !title.trim()) setTitle(p.title);
                  }}
                  className="w-full rounded-lg border border-border2 bg-panel2 px-2.5 py-2 text-[13px] text-txt outline-none focus:border-accent"
                >
                  <option value="">Don&apos;t link a reel — just show the video</option>
                  {videoProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {videoProjectId && (
              <div className="space-y-0.5 rounded-lg border border-border2 p-2">
                <ToggleRow
                  checked={revealRecipe}
                  onChange={() => setRevealRecipe((v) => !v)}
                  label="Reveal transcript & shot prompts"
                  hint="Viewers see exactly how you made it."
                />
                <ToggleRow
                  checked={allowRemix}
                  onChange={() => setAllowRemix((v) => !v)}
                  label="Allow remixing into others' editors"
                  hint="One click forks your reel into their editor."
                />
              </div>
            )}
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

/** A compact checkbox row used for the video-share opt-ins. */
function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-panel2"
    >
      <span
        className={
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors " +
          (checked ? "border-accent bg-accent text-accent-ink" : "border-border2")
        }
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-txt">{label}</span>
        <span className="block text-[11px] text-txt3">{hint}</span>
      </span>
    </button>
  );
}
