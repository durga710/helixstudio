import "server-only";
import { put } from "@vercel/blob";

/**
 * Thin wrapper over Vercel Blob for game build artifacts (Godot `.pck` packs +
 * the shared engine runtime). Helix otherwise stores everything as text in
 * Postgres; binary build output needs real object storage.
 *
 * Artifacts are uploaded with an unguessable random suffix and are NEVER linked
 * to the client directly — the `/play/[id]` route fetches them server-side and
 * streams them same-origin, so access stays gated by `guardWorkspace`. Swap this
 * one file for S3/R2 to move off Vercel Blob.
 */

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/** Blob is configured (token present). Routes should 503 cleanly when false. */
export function blobEnabled(): boolean {
  return Boolean(TOKEN);
}

/** Upload bytes; returns the stored object's URL (kept server-side only). */
export async function putArtifact(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const res = await put(key, body, {
    access: "public",
    contentType,
    addRandomSuffix: true,
    token: TOKEN,
  });
  return res.url;
}

/** Server-side fetch of a stored artifact as a stream (for the /play proxy). */
export async function getArtifactStream(url: string): Promise<ReadableStream<Uint8Array> | null> {
  const res = await fetch(url, { cache: "no-store" });
  return res.ok ? res.body : null;
}
