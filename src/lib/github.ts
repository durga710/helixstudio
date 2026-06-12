import "server-only";

/**
 * GitHub API plumbing (raw fetch, no Octokit). Every call runs as the
 * signed-in user via withGitHubToken() — there is NO workspace/env token
 * fallback in GCODE; no token means the UI prompts to connect GitHub.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const GH_API = "https://api.github.com";

const tokenContext = new AsyncLocalStorage<string>();

export function withGitHubToken<T>(token: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return token ? tokenContext.run(token, fn) : fn();
}

function activeToken(): string | undefined {
  return tokenContext.getStore();
}

export function hasGitHubToken(): boolean {
  return Boolean(activeToken());
}

function ghHeaders(): Record<string, string> {
  const token = activeToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "helix-studio",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function ghReq(method: string, path: string, body?: unknown): Promise<{ ok: boolean; json: unknown }> {
  try {
    const res = await fetch(`${GH_API}${path}`, {
      method,
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  }
}

function decodeBase64(content: string | undefined): string | null {
  if (!content) return null;
  try {
    return Buffer.from(content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export interface RepoTreeEntry {
  path: string;
  size: number;
}

/**
 * Lists the repo's text-editable files (blobs) on a branch for the workspace.
 * Skips vendored/build dirs; capped so huge monorepos stay usable.
 */
export async function fetchRepoTree(
  repo: string,
  ref?: string,
): Promise<{ branch: string; files: RepoTreeEntry[] } | null> {
  const meta = await ghJson<{ default_branch?: string }>(`/repos/${repo}`);
  if (!meta?.default_branch) return null;
  const branch = ref || meta.default_branch;

  type TreeResponse = { tree?: { path: string; type: string; size?: number }[] };
  let tree: TreeResponse | null = null;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
      headers: ghHeaders(),
      cache: "no-store",
    });
    // 409 = "Git Repository is empty" — a repo with no commits yet. Import it
    // as an empty workspace; the first push creates the root commit.
    if (res.status === 409) return { branch, files: [] };
    if (res.ok) tree = (await res.json()) as TreeResponse;
  } catch {
    return null;
  }
  if (!tree?.tree) return null;

  const SKIP = /(^|\/)(node_modules|dist|build|\.next|vendor|\.git)(\/|$)/;
  const files = tree.tree
    .filter((n) => n.type === "blob" && !SKIP.test(n.path))
    .slice(0, 500)
    .map((n) => ({ path: n.path, size: n.size ?? 0 }));

  return { branch, files };
}

/** Reads one file's text content from a branch. Null if missing/too big/binary. */
export async function fetchRepoFileContent(
  repo: string,
  path: string,
  ref?: string,
): Promise<{ content: string } | null> {
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await ghJson<{ content?: string; encoding?: string; size?: number }>(
    `/repos/${repo}/contents/${path}${refQuery}`,
  );
  if (!data || data.size === undefined || data.size > 400_000) return null;
  const content = decodeBase64(data.content);
  if (content === null || content.includes("\u0000")) return null;
  return { content };
}

/**
 * Lists the repos the active token can reach — the source of truth for the
 * import picker and push targets. Distinguishes "unauthorized" (no/revoked
 * token → prompt to connect) from a plain network failure.
 */
export async function listAccessibleRepos(): Promise<
  | { repos: { repo: string; private: boolean; defaultBranch: string; pushedAt: string | null }[] }
  | { unauthorized: true }
  | null
> {
  if (!activeToken()) return { unauthorized: true };
  try {
    const res = await fetch(`${GH_API}/user/repos?per_page=100&sort=pushed`, {
      headers: ghHeaders(),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { unauthorized: true };
    if (!res.ok) return null;
    const repos = (await res.json()) as Array<{
      full_name: string;
      private: boolean;
      default_branch: string;
      pushed_at?: string;
    }>;
    return {
      repos: repos.map((r) => ({
        repo: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at ?? null,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Creates a new repo on the authenticated account. auto_init gives it a
 * default branch so pushFilesToRepo can commit straight to main.
 */
export async function createRepo(
  name: string,
  opts: { description?: string; isPrivate?: boolean } = {},
): Promise<{ repo: string; url: string; defaultBranch: string } | { error: string }> {
  const { ok: created, json } = await ghReq("POST", "/user/repos", {
    name,
    description: opts.description?.slice(0, 200),
    private: opts.isPrivate ?? false,
    auto_init: true,
  });
  const data = (json ?? {}) as {
    full_name?: string;
    html_url?: string;
    default_branch?: string;
    message?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!created || !data.full_name) {
    const detail = data.errors?.[0]?.message || data.message || "creation failed";
    return { error: `couldn't create repo "${name}": ${detail}` };
  }
  return { repo: data.full_name, url: data.html_url ?? "", defaultBranch: data.default_branch ?? "main" };
}

/**
 * Pushes files (and deletions) to a branch in one commit using the git data
 * API (tree/commit/ref). Creates the branch off the default branch if it
 * doesn't exist; otherwise commits on top of it.
 */
export async function pushFilesToRepo(
  repo: string,
  opts: {
    branch: string;
    message: string;
    files: { path: string; content: string }[];
    deletions?: string[];
  },
): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }> {
  const meta = await ghJson<{ default_branch?: string }>(`/repos/${repo}`);
  if (!meta?.default_branch)
    return {
      error: `your GitHub token has no access to ${repo} (or it doesn't exist). Reconnect GitHub or check the repo name.`,
    };

  const baseRef = await ghJson<{ object?: { sha: string } }>(
    `/repos/${repo}/git/ref/heads/${meta.default_branch}`,
  );
  // No refs at all = an empty repo (no commits yet). The git data API can't
  // operate on it, so bootstrap the root commit on the default branch instead.
  if (!baseRef?.object?.sha) return pushRootCommit(repo, meta.default_branch, opts);

  let headSha = baseRef.object.sha;
  if (opts.branch !== meta.default_branch) {
    const created = await ghReq("POST", `/repos/${repo}/git/refs`, {
      ref: `refs/heads/${opts.branch}`,
      sha: headSha,
    });
    if (!created.ok) {
      const existing = await ghJson<{ object?: { sha: string } }>(
        `/repos/${repo}/git/ref/heads/${opts.branch}`,
      );
      if (!existing?.object?.sha) return { error: "couldn't create the branch (token may be read-only)" };
      headSha = existing.object.sha;
    }
  }

  const headCommit = await ghJson<{ tree?: { sha: string } }>(`/repos/${repo}/git/commits/${headSha}`);
  if (!headCommit?.tree?.sha) return { error: "couldn't read the base commit" };

  // sha: null deletes the path from the tree (how the git data API removes files).
  const treeEntries: Array<Record<string, unknown>> = [
    ...opts.files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    ...(opts.deletions ?? []).map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
  ];

  const treeRes = await ghReq("POST", `/repos/${repo}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree: treeEntries,
  });
  const tree = treeRes.json as { sha?: string } | null;
  if (!treeRes.ok || !tree?.sha) return { error: "couldn't write the files (token may be read-only)" };

  const commitRes = await ghReq("POST", `/repos/${repo}/git/commits`, {
    message: opts.message,
    tree: tree.sha,
    parents: [headSha],
  });
  const commit = commitRes.json as { sha?: string; html_url?: string } | null;
  if (!commitRes.ok || !commit?.sha) return { error: "couldn't create the commit" };

  const refRes = await ghReq("PATCH", `/repos/${repo}/git/refs/heads/${opts.branch}`, { sha: commit.sha });
  if (!refRes.ok) return { error: "couldn't update the branch" };

  return { branch: opts.branch, commitSha: commit.sha, commitUrl: commit.html_url ?? "" };
}

/**
 * First commit into an EMPTY repo. The git data API rejects empty repos
 * (409), but the Contents API can create the root commit — so the first file
 * goes through PUT /contents (which also creates the branch), and the rest
 * ride the normal git-data path on top of it. Deletions are meaningless in an
 * empty repo and are dropped. Always lands on the given (default) branch —
 * there is nothing to branch from or diff against yet.
 */
async function pushRootCommit(
  repo: string,
  branch: string,
  opts: { message: string; files: { path: string; content: string }[] },
): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }> {
  const [first, ...rest] = opts.files;
  if (!first) return { error: "the repo is empty and there are no files to push" };

  const encodedPath = first.path.split("/").map(encodeURIComponent).join("/");
  const put = await ghReq("PUT", `/repos/${repo}/contents/${encodedPath}`, {
    message: opts.message,
    content: Buffer.from(first.content, "utf8").toString("base64"),
    branch,
  });
  const putJson = put.json as { commit?: { sha?: string; html_url?: string } } | null;
  if (!put.ok || !putJson?.commit?.sha)
    return { error: "couldn't create the first commit (token may be read-only)" };

  if (rest.length === 0) {
    return { branch, commitSha: putJson.commit.sha, commitUrl: putJson.commit.html_url ?? "" };
  }
  // Repo is no longer empty — the normal path handles the remaining files.
  return pushFilesToRepo(repo, { branch, message: opts.message, files: rest });
}

/** Opens a PR for an existing branch against the default branch. */
export async function createPullRequest(
  repo: string,
  opts: { title: string; body: string; head: string },
): Promise<{ url: string } | { error: string }> {
  const meta = await ghJson<{ default_branch?: string }>(`/repos/${repo}`);
  if (!meta?.default_branch) return { error: "repo not found or no access" };

  const prRes = await ghReq("POST", `/repos/${repo}/pulls`, {
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: meta.default_branch,
  });
  const prJson = prRes.json as { html_url?: string } | null;
  if (!prRes.ok || !prJson?.html_url) return { error: "couldn't open the PR" };
  return { url: prJson.html_url };
}
