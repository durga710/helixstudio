import "server-only";

/**
 * Pure, deterministic version-bump planning for the premium-freshness job. No
 * network, no sandbox — just "given current pins + the latest versions, what's
 * safe to bump?". Rules: same-major minor/patch only; MAJORS are held for admin
 * review; constraint groups bump as a set (a held major in a group holds the
 * whole group). Kept pure so it's unit-testable.
 */

import semver from "semver";
import type { TemplateFile } from "./types";

export interface DepBump {
  name: string;
  from: string;
  to: string;
}
export interface HeldMajor {
  name: string;
  from: string;
  latest: string;
}
export interface BumpPlan {
  bumps: DepBump[];
  held: HeldMajor[];
}

/** Packages that must move together (or not at all). A held major in a group
 * blocks every bump in that group. */
const CONSTRAINT_GROUPS: string[][] = [
  ["zod", "@hookform/resolvers"],
  ["tailwindcss", "tailwind-merge", "@tailwindcss/postcss"],
  ["react", "react-dom"],
  ["next", "eslint-config-next"],
];

function groupOf(name: string): string[] | undefined {
  return CONSTRAINT_GROUPS.find((g) => g.includes(name));
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse EXACT-pinned npm deps (e.g. "1.2.9") from a package.json string. Range
 * specs (^ ~ > < x * ||) are skipped — premium templates pin exact, and the job
 * only bumps exact pins so the change is precise. */
export function parseExactNpmDeps(pkgJsonContent: string): { name: string; version: string }[] {
  let json: unknown;
  try {
    json = JSON.parse(pkgJsonContent);
  } catch {
    return [];
  }
  const out: { name: string; version: string }[] = [];
  const obj = json as Record<string, unknown>;
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = obj[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof range === "string" && /^\d+\.\d+\.\d+$/.test(range)) {
        out.push({ name, version: range });
      }
    }
  }
  return out;
}

/** Plan npm bumps from current pins + latest versions. With `includeMajors` the
 * major jumps are applied instead of held (used when an admin approves one). */
export function planNpmBumps(
  deps: { name: string; version: string }[],
  latest: Record<string, string | null>,
  opts?: { includeMajors?: boolean },
): BumpPlan {
  const held: HeldMajor[] = [];
  const candidates: DepBump[] = [];

  for (const d of deps) {
    const lt = latest[d.name];
    if (!lt || !semver.valid(d.version) || !semver.valid(lt) || !semver.gt(lt, d.version)) continue;
    if (semver.major(lt) > semver.major(d.version) && !opts?.includeMajors) {
      held.push({ name: d.name, from: d.version, latest: lt });
    } else {
      candidates.push({ name: d.name, from: d.version, to: lt });
    }
  }

  // A constraint group with any held major blocks all its bumps.
  const heldGroups = new Set<string[]>();
  for (const h of held) {
    const g = groupOf(h.name);
    if (g) heldGroups.add(g);
  }

  const bumps: DepBump[] = [];
  for (const c of candidates) {
    const g = groupOf(c.name);
    if (g && heldGroups.has(g)) {
      held.push({ name: c.name, from: c.from, latest: c.to });
    } else {
      bumps.push(c);
    }
  }
  return { bumps, held };
}

/** Apply bumps to a package.json string by exact-replacing each pinned version. */
export function applyNpmBumps(pkgJsonContent: string, bumps: DepBump[]): string {
  let out = pkgJsonContent;
  for (const b of bumps) {
    const re = new RegExp(`("${escapeReg(b.name)}"\\s*:\\s*")${escapeReg(b.from)}(")`);
    out = out.replace(re, `$1${b.to}$2`);
  }
  return out;
}

/* ── CDN libraries (static / games) ──────────────────────────────────────── */

export interface CdnLib {
  lib: string;
  version: string;
}

// jsdelivr/unpkg URLs: …/npm/<name>@<x.y.z>…  or  unpkg.com/<name>@<x.y.z>…
const CDN_RE = /(?:cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/)(@?[\w.-]+(?:\/[\w.-]+)?)@(\d+\.\d+\.\d+)/g;

/** Extract pinned CDN libs (npm name → version) from html/js/css files. */
export function extractCdnLibs(files: TemplateFile[]): CdnLib[] {
  const seen = new Map<string, string>();
  for (const f of files) {
    if (!/\.(html|js|css|md|ejs)$/i.test(f.path)) continue;
    const re = new RegExp(CDN_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.content)) !== null) {
      // For "chart.js@4.4.7/dist/chart.umd.min.js" the name group can greedily
      // include a path segment; trim anything after the version is handled by
      // matching name then @version, so m[1] is the package name.
      const name = m[1];
      if (!seen.has(name)) seen.set(name, m[2]);
    }
  }
  return [...seen.entries()].map(([lib, version]) => ({ lib, version }));
}

/** Plan CDN bumps (same rules: same-major minor/patch; majors held unless approved). */
export function planCdnBumps(
  libs: CdnLib[],
  latest: Record<string, string | null>,
  opts?: { includeMajors?: boolean },
): BumpPlan {
  const bumps: DepBump[] = [];
  const held: HeldMajor[] = [];
  for (const l of libs) {
    const lt = latest[l.lib];
    if (!lt || !semver.valid(l.version) || !semver.valid(lt) || !semver.gt(lt, l.version)) continue;
    if (semver.major(lt) > semver.major(l.version) && !opts?.includeMajors) {
      held.push({ name: l.lib, from: l.version, latest: lt });
    } else {
      bumps.push({ name: l.lib, from: l.version, to: lt });
    }
  }
  return { bumps, held };
}

/** Apply CDN bumps by replacing every `name@from` with `name@to` in the text. */
export function applyCdnBumps(content: string, bumps: DepBump[]): string {
  let out = content;
  for (const b of bumps) {
    out = out.split(`${b.name}@${b.from}`).join(`${b.name}@${b.to}`);
  }
  return out;
}
