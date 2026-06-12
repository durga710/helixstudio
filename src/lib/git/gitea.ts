import "server-only";

/**
 * Gitea / Forgejo adapter (REST v1, raw fetch). Self-hosted only: auth.baseUrl
 * is required (Codeberg counts). Tokens ride the `Authorization: token …`
 * scheme. Repo ids are "owner/repo".
 */

import {
  activeAuth,
  type GitAuth,
  type GitProvider,
  type PushOpts,
  type RepoListEntry,
  type RepoTreeEntry,
} from "./types";

const SKIP = /(^|\/)(node_modules|dist|build|\.next|vendor|\.git)(\/|$)/;

/** NUL byte — its presence marks a file as binary. */
const NUL = String.fromCharCode(0);

function gtAuth(): GitAuth | undefined {
  const auth = activeAuth();
  // baseUrl is mandatory for Gitea — without it there is nothing to call.
  return auth?.provider === "gitea" && auth.baseUrl ? auth : undefined;
}

function gtWebBase(): string | null {
  return gtAuth()?.baseUrl ?? null;
}

function gtApi(): string | null {
  const base = gtWebBase();
  return base ? `${base}/api/v1` : null;
}

function gtHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "helix-studio" };
  const token = gtAuth()?.token;
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

/** "owner/repo" with each segment encoded for use in URL paths. */
function gtRepoPath(repo: string): string {
  return repo.split("/").map(encodeURIComponent).join("/");
}

async function gtJson<T>(path: string): Promise<T | null> {
  const api = gtApi();
  if (!api) return null;
  try {
    const res = await fetch(`${api}${path}`, { headers: gtHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function gtReq(method: string, path: string, body?: unknown): Promise<{ ok: boolean; json: unknown }> {
  const api = gtApi();
  if (!api) return { ok: false, json: null };
  try {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { ...gtHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  }
}

/** Gitea errors are { message } (sometimes with a url hint). */
function gtError(json: unknown): string {
  const msg = (json as { message?: unknown } | null)?.message;
  return typeof msg === "string" ? msg : "request failed";
}

function decodeBase64(content: string | undefined): string | null {
  if (!content) return null;
  try {
    return Buffer.from(content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** The signed-in user's repos — four pages of 50 caps the picker at 200. */
async function listRepos(): Promise<{ repos: RepoListEntry[] } | { unauthorized: true } | null> {
  const api = gtApi();
  if (!api || !gtAuth()?.token) return { unauthorized: true };
  const repos: RepoListEntry[] = [];
  try {
    for (let page = 1; page <= 4; page++) {
      const res = await fetch(`${api}/user/repos?limit=50&page=${page}`, { headers: gtHeaders(), cache: "no-store" });
      if (res.status === 401 || res.status === 403) return { unauthorized: true };
      if (!res.ok) return repos.length ? { repos } : null;
      const batch = (await res.json()) as Array<{
        full_name?: string;
        private?: boolean;
        default_branch?: string;
        updated_at?: string;
      }>;
      for (const r of batch) {
        if (!r.full_name) continue;
        repos.push({
          repo: r.full_name,
          private: r.private ?? true,
          defaultBranch: r.default_branch ?? "main",
          pushedAt: r.updated_at ?? null,
        });
      }
      if (batch.length < 50) break;
    }
    // /user/repos has no activity sort — order newest-updated first ourselves.
    repos.sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
    return { repos };
  } catch {
    return null;
  }
}

/** Blob entries (path → sha) of a tree ref. Bounded pagination; null = unreadable. */
async function gtTreeBlobs(rp: string, treeRef: string): Promise<Map<string, string> | null> {
  const blobs = new Map<string, string>();
  for (let page = 1; page <= 4; page++) {
    const data = await gtJson<{ tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }> }>(
      `/repos/${rp}/git/trees/${encodeURIComponent(treeRef)}?recursive=true&per_page=500&page=${page}`,
    );
    if (!data?.tree) return page === 1 ? null : blobs;
    for (const e of data.tree) {
      if (e.type === "blob" && e.path) blobs.set(e.path, e.sha ?? "");
    }
    if (data.tree.length < 500) break;
  }
  return blobs;
}

/** All blob paths on a branch. Gitea reports `empty` on the repo itself. */
async function fetchRepoTree(repo: string, ref?: string): Promise<{ branch: string; files: RepoTreeEntry[] } | null> {
  const rp = gtRepoPath(repo);
  const meta = await gtJson<{ default_branch?: string; empty?: boolean }>(`/repos/${rp}`);
  if (!meta) return null;
  const branch = ref || meta.default_branch || "main";
  if (meta.empty) return { branch, files: [] };

  type TreeResponse = { tree?: Array<{ path?: string; type?: string; size?: number }> };
  let tree = await gtJson<TreeResponse>(
    `/repos/${rp}/git/trees/${encodeURIComponent(branch)}?recursive=true&per_page=500`,
  );
  if (!tree?.tree) {
    // Some Gitea versions only take a sha as the tree ref — resolve the branch.
    const b = await gtJson<{ commit?: { id?: string } }>(`/repos/${rp}/branches/${encodeURIComponent(branch)}`);
    if (b?.commit?.id) {
      tree = await gtJson<TreeResponse>(`/repos/${rp}/git/trees/${b.commit.id}?recursive=true&per_page=500`);
    }
  }
  if (!tree?.tree) return null;

  const files = tree.tree
    .filter((e): e is { path: string; type: string; size?: number } => e.type === "blob" && Boolean(e.path))
    .filter((e) => !SKIP.test(e.path))
    .slice(0, 500)
    .map((e) => ({ path: e.path, size: e.size ?? 0 }));
  return { branch, files };
}

/** Reads one file's text content from a branch. Null if missing/too big/binary. */
async function fetchRepoFileContent(repo: string, path: string, ref?: string): Promise<{ content: string } | null> {
  const rp = gtRepoPath(repo);
  const encPath = path.split("/").map(encodeURIComponent).join("/");
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await gtJson<{ content?: string; size?: number }>(`/repos/${rp}/contents/${encPath}${refQuery}`);
  if (!data || data.size === undefined || data.size > 400_000) return null;
  const content = decodeBase64(data.content);
  if (content === null || content.includes(NUL)) return null;
  return { content };
}

/**
 * One commit with files + deletions via the batch POST /contents endpoint.
 * Gitea wants the right operation per path AND the current blob sha for
 * update/delete — both come from one tree read of the base branch. A new
 * branch is created in the same call via new_branch; an empty repo takes
 * the root commit straight on the default branch name.
 */
async function pushFilesToRepo(
  repo: string,
  opts: PushOpts,
): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }> {
  const rp = gtRepoPath(repo);
  const meta = await gtJson<{ default_branch?: string; empty?: boolean }>(`/repos/${rp}`);
  if (!meta)
    return {
      error: `your Gitea token has no access to ${repo} (or it doesn't exist). Reconnect Gitea or check the repo name.`,
    };
  const defaultBranch = meta.default_branch || "main";

  const finish = (
    res: { ok: boolean; json: unknown },
    branch: string,
  ): { branch: string; commitSha: string; commitUrl: string } | { error: string } => {
    const data = res.json as { commit?: { sha?: string; html_url?: string } } | null;
    const sha = data?.commit?.sha ?? "";
    if (!res.ok) return { error: `Gitea rejected the commit (token may be read-only): ${gtError(res.json)}` };
    const commitUrl = data?.commit?.html_url ?? (sha ? `${gtWebBase()}/${repo}/commit/${sha}` : "");
    return { branch, commitSha: sha, commitUrl };
  };

  // Empty repo: the first batch commit creates the default branch itself.
  // Everything is "create"; deletions are meaningless and dropped.
  if (meta.empty) {
    if (opts.files.length === 0) return { error: "the repo is empty and there are no files to push" };
    const res = await gtReq("POST", `/repos/${rp}/contents`, {
      message: opts.message,
      branch: defaultBranch,
      files: opts.files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        operation: "create",
      })),
    });
    return finish(res, defaultBranch);
  }

  const existing = await gtJson<{ name?: string }>(`/repos/${rp}/branches/${encodeURIComponent(opts.branch)}`);
  const branchExists = Boolean(existing?.name);
  const baseBranch = branchExists ? opts.branch : defaultBranch;

  const blobs = await gtTreeBlobs(rp, baseBranch);
  if (!blobs) return { error: `couldn't read ${repo}@${baseBranch} on Gitea to prepare the commit` };

  const files: Array<Record<string, unknown>> = [
    ...opts.files.map((f) => {
      const sha = blobs.get(f.path);
      const content = Buffer.from(f.content, "utf8").toString("base64");
      return sha
        ? { path: f.path, content, operation: "update", sha }
        : { path: f.path, content, operation: "create" };
    }),
    // Deleting a path that isn't on the branch fails the whole commit — drop those.
    ...(opts.deletions ?? [])
      .filter((p) => blobs.has(p))
      .map((p) => ({ path: p, operation: "delete", sha: blobs.get(p) })),
  ];
  if (files.length === 0) return { error: "nothing to commit" };

  const payload: Record<string, unknown> = { message: opts.message, branch: baseBranch, files };
  if (!branchExists) payload.new_branch = opts.branch;

  const res = await gtReq("POST", `/repos/${rp}/contents`, payload);
  return finish(res, opts.branch);
}

/**
 * Creates a repo on the authenticated account. auto_init gives it a default
 * branch so pushFilesToRepo can commit straight to it.
 */
async function createRepo(
  name: string,
  opts: { description?: string; isPrivate?: boolean } = {},
): Promise<{ repo: string; url: string; defaultBranch: string } | { error: string }> {
  const { ok, json } = await gtReq("POST", "/user/repos", {
    name,
    description: opts.description?.slice(0, 200),
    private: opts.isPrivate ?? false,
    auto_init: true,
  });
  const data = json as { full_name?: string; html_url?: string; default_branch?: string } | null;
  if (!ok || !data?.full_name) return { error: `couldn't create Gitea repo "${name}": ${gtError(json)}` };
  return { repo: data.full_name, url: data.html_url ?? "", defaultBranch: data.default_branch ?? "main" };
}

/** Opens a PR for an existing branch against the default branch. */
async function createPullRequest(
  repo: string,
  opts: { title: string; body: string; head: string },
): Promise<{ url: string } | { error: string }> {
  const rp = gtRepoPath(repo);
  const meta = await gtJson<{ default_branch?: string }>(`/repos/${rp}`);
  if (!meta?.default_branch)
    return { error: `your Gitea token has no access to ${repo} (or the repo has no commits)` };

  const { ok, json } = await gtReq("POST", `/repos/${rp}/pulls`, {
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: meta.default_branch,
  });
  const pr = json as { html_url?: string } | null;
  if (!ok || !pr?.html_url) return { error: `couldn't open the Gitea pull request: ${gtError(json)}` };
  return { url: pr.html_url };
}

export const giteaProvider: GitProvider = {
  name: "gitea",
  listRepos,
  fetchRepoTree,
  fetchRepoFileContent,
  pushFilesToRepo,
  createRepo,
  createPullRequest,
};
