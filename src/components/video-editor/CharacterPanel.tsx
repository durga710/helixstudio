"use client";

/**
 * CharacterPanel — define ONE reference image for a reel ("the character"). The
 * composer sends it with every shot's render (Sora's input_reference) to keep
 * the subject/style consistent across shots.
 *
 * Honest limitation surfaced in the copy: Sora generates each shot separately,
 * so even with the same reference the character still drifts somewhat — this
 * nudges consistency, it doesn't lock identity.
 *
 * The picture is cover-fit to the exact video size on the client (canvas) so
 * Sora never rejects a dimension mismatch, then handed up as a Blob. `onImage`
 * must be stable (the parent wraps it in useCallback).
 */

import { useEffect, useRef, useState } from "react";
import { ImagePlus, UserRound, X } from "lucide-react";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

/** Cover-fit `file` to exactly w×h and return a JPEG Blob. */
async function resizeToCover(file: File, w: number, h: number): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
  );
}

function dims(size: string): [number, number] {
  const [w, h] = size.split("x").map((n) => Number(n));
  return [w || 1280, h || 720];
}

export function CharacterPanel({
  size,
  onImage,
}: {
  size: string;
  /** Called with the resized reference Blob (or null when cleared). Must be
   *  stable (parent useCallback) — it's a dependency of the resize effect. */
  onImage: (blob: Blob | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string | null>(null);

  // Re-resize the stored file whenever the target video size changes, so the
  // reference always matches the dimensions Sora expects. (No setState here.)
  useEffect(() => {
    const f = fileRef.current;
    if (!f) return;
    let alive = true;
    const [w, h] = dims(size);
    resizeToCover(f, w, h)
      .then((b) => {
        if (alive) onImage(b);
      })
      .catch(() => {
        /* keep the previous reference */
      });
    return () => {
      alive = false;
    };
  }, [size, onImage]);

  // Revoke the preview object-URL on unmount.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function pick(file: File | null) {
    setError(null);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (!file) {
      fileRef.current = null;
      setPreview(null);
      onImage(null);
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("That image is too large (max 12 MB).");
      return;
    }
    fileRef.current = file;
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setPreview(url);
    try {
      const [w, h] = dims(size);
      onImage(await resizeToCover(file, w, h));
    } catch {
      setError("Couldn't process that image — try another.");
      onImage(null);
    }
  }

  return (
    <div className="mt-4">
      <label className="label-tactical mb-1.5 flex items-center gap-1.5">
        <UserRound className="h-3.5 w-3.5" /> Character · optional
      </label>
      {preview ? (
        <div className="flex items-center gap-3 rounded-xl border border-border2 bg-panel2 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview */}
          <img src={preview} alt="Character reference" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-txt3">
            Used on every shot to keep your character consistent.
          </p>
          <button
            type="button"
            onClick={() => void pick(null)}
            aria-label="Remove character reference"
            className="shrink-0 rounded-lg border border-border2 p-1.5 text-txt3 transition-colors hover:border-bad hover:text-bad"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border2 bg-panel2 px-3.5 py-2.5 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
          <ImagePlus className="h-4 w-4 text-accent" />
          Attach a character reference
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-txt3">
        Best-effort: each shot is generated separately, so the character can still drift between shots.
      </p>
      {error && <p className="mt-1 text-[11px] text-warn">{error}</p>}
    </div>
  );
}
