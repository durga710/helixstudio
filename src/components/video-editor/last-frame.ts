/**
 * Grab a still from near the end of a generated clip, cover-fit to the video
 * dimensions, as a JPEG Blob. Used for "seamless continuity": the last frame of
 * one clip becomes the reference image for the next shot, so clips visually
 * continue instead of jump-cutting.
 *
 * Best-effort — resolves null on any failure (the caller falls back to no
 * reference). The clip streams from our same-origin /api/video/[id]/content
 * route, so drawing it to a canvas does not taint the canvas.
 */
export function lastFrameOf(videoId: string, w: number, h: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    let settled = false;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        /* noop */
      }
      resolve(blob);
    };

    const grab = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        const vw = video.videoWidth || w;
        const vh = video.videoHeight || h;
        const scale = Math.max(w / vw, h / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
        canvas.toBlob((b) => finish(b), "image/jpeg", 0.9);
      } catch {
        finish(null);
      }
    };

    video.onseeked = grab;
    video.onloadeddata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 1;
      try {
        video.currentTime = Math.max(0, dur - 0.05);
      } catch {
        grab();
      }
    };
    video.onerror = () => finish(null);
    // Never hang the render loop on a stuck decode.
    setTimeout(() => finish(null), 15_000);

    video.src = `/api/video/${encodeURIComponent(videoId)}/content`;
  });
}
