import "server-only";

/**
 * Turbo build — the manifest planner (server side).
 *
 * ONE model call (the strong model) turns a request into a build MANIFEST: a
 * short shared "contract" (the data model, key types, conventions every file
 * must agree on) plus a flat list of files to generate, each with a one-line
 * spec. No code is produced here — the output is small. The manifest is then
 * fanned out to parallel stateless generators (see generate.ts).
 *
 * The pure parser + types live in ./parse (unit-tested); this file adds the
 * model call.
 */

import { resolveAiPrefs, runOneShotResilient } from "@/lib/ai-agent";
import type { Workspace } from "@/generated/prisma/client";
import { listWorkspaceFiles } from "@/lib/workspace";
import { parseManifest, type TurboManifest } from "./parse";

const MANIFEST_SYSTEM =
  "You are the ARCHITECT for a one-shot parallel build. Turn the user's request into a BUILD MANIFEST that " +
  "independent workers will each generate ONE file from, with no further conversation between them. So the " +
  "manifest must carry everything they need to stay consistent.\n" +
  "Reply with ONLY a JSON object, no prose:\n" +
  '{"contract":"<the shared contract: the data model, the core TypeScript types/interfaces (write them out), ' +
  'the route/file conventions, the design tokens or component names to reuse — everything every file must agree ' +
  'on, kept tight>","files":[{"path":"src/...","spec":"<what this file must contain and export, 1-2 sentences>"}]}\n' +
  "Rules: list every file needed for a COMPLETE, runnable result (pages, components, lib, types, api). Reuse the " +
  "existing scaffold/template files named in PROJECT NOTES instead of recreating config. Keep specs concrete " +
  "(name the exports, the props, the route). Do NOT write file bodies here — only the contract and the specs.";

/**
 * Plan the manifest with one strong-model call. Returns null on any failure so
 * the caller falls back to the sequential build. `meter.tokensUsed` accumulates
 * the call's token cost so the caller can bill it.
 */
export async function planManifest(
  ws: Workspace,
  userId: string,
  request: string,
  notes: string | null,
  meter: { tokensUsed: number },
): Promise<TurboManifest | null> {
  const prefs = await resolveAiPrefs(userId);
  const files = await listWorkspaceFiles(ws).catch(() => []);
  const tree = files.map((f) => f.path).slice(0, 400).join("\n");
  const user =
    `REQUEST:\n${request}\n\n` +
    (notes ? `PROJECT NOTES (the scaffold already in place — build on it, don't recreate config):\n${notes}\n\n` : "") +
    `EXISTING FILES:\n${tree || "(empty project)"}`;
  const res = await runOneShotResilient({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    extraHeaders: prefs.extraHeaders,
    system: MANIFEST_SYSTEM,
    user,
    maxTokens: 4_000,
  });
  if ("error" in res) return null;
  meter.tokensUsed += res.tokensUsed;
  return parseManifest(res.text);
}
