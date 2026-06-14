import "server-only";

/**
 * Latest-version lookups against the public registries — the only network part
 * of the freshness job. npm (CDN libs are npm-published too) + PyPI.
 */

/** npm registry path: scoped names keep the @ but encode the slash. */
function npmPath(name: string): string {
  return name.startsWith("@") ? name.replace("/", "%2F") : name;
}

/** Latest published npm version (dist-tags.latest), or null on any failure. */
export async function fetchLatestNpm(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${npmPath(name)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/vnd.npm.install-v1+json" }, // smaller payload
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { "dist-tags"?: { latest?: string } };
    return body["dist-tags"]?.latest ?? null;
  } catch {
    return null;
  }
}

/** Latest published PyPI version (info.version), or null on any failure. */
export async function fetchLatestPypi(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { info?: { version?: string } };
    return body.info?.version ?? null;
  } catch {
    return null;
  }
}

/** Resolve latest for many npm names at once → { name: latest|null }. */
export async function fetchLatestNpmMany(names: string[]): Promise<Record<string, string | null>> {
  const uniq = [...new Set(names)];
  const entries = await Promise.all(uniq.map(async (n) => [n, await fetchLatestNpm(n)] as const));
  return Object.fromEntries(entries);
}

/** Confirm a (rewritten) CDN URL actually exists — guards against bumping a CDN
 * pin to a version that 404s. */
export async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}
