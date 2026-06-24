/**
 * Video embed normalization for Community video posts. We NEVER iframe a raw
 * user-supplied URL — only an allowlist of trusted providers, each parsed down
 * to its canonical, parameter-free embed URL. Anything else returns null and is
 * rejected at publish time. Pure module (no deps) so it's unit-testable.
 */

export type EmbedProvider = "youtube" | "vimeo" | "loom";

export interface NormalizedEmbed {
  provider: EmbedProvider;
  /** Canonical iframe src, e.g. https://www.youtube.com/embed/<id>. */
  embedUrl: string;
  /** Best-effort poster image (YouTube only); null otherwise. */
  thumbnailUrl: string | null;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const NUMERIC_ID = /^\d{6,12}$/;
const LOOM_ID = /^[a-f0-9]{20,40}$/i;

/** Parse + validate a pasted video URL into a safe embed. Returns null for any
 * non-allowlisted or malformed input. */
export function normalizeEmbed(raw: string): NormalizedEmbed | null {
  const input = (raw || "").trim();
  if (!input || input.length > 500) return null;

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname;

  // YouTube: youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id =
      u.searchParams.get("v") ||
      path.match(/^\/(?:embed|shorts|v)\/([\w-]{11})/)?.[1] ||
      "";
    if (YOUTUBE_ID.test(id)) {
      return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    }
    return null;
  }
  if (host === "youtu.be") {
    const id = path.slice(1).match(/^([\w-]{11})/)?.[1] ?? "";
    if (YOUTUBE_ID.test(id)) {
      return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    }
    return null;
  }

  // Vimeo: vimeo.com/<id> or player.vimeo.com/video/<id>
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = path.match(/(?:\/video)?\/(\d{6,12})/)?.[1] ?? "";
    if (NUMERIC_ID.test(id)) {
      return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}`, thumbnailUrl: null };
    }
    return null;
  }

  // Loom: loom.com/share/<id> or /embed/<id>
  if (host === "loom.com") {
    const id = path.match(/\/(?:share|embed)\/([a-f0-9]{20,40})/i)?.[1] ?? "";
    if (LOOM_ID.test(id)) {
      return { provider: "loom", embedUrl: `https://www.loom.com/embed/${id}`, thumbnailUrl: null };
    }
    return null;
  }

  return null;
}
