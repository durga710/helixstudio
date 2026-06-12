import "server-only";

/**
 * GitLab adapter (REST v4, raw fetch). Works against gitlab.com or any
 * self-hosted instance via auth.baseUrl. Repo ids are full namespace paths
 * ("group/sub/project") and must be URL-encoded as a SINGLE :id segment —
 * GitLab accepts the whole path percent-encoded where :id appears.
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

function glAuth(): GitAuth | undefined {
  const auth = activeAuth();
  return auth?.provider === "gitlab" ? auth : undefined;
}

/** Web origin (for commit URLs); the API lives under /api/v4 below it. */
function glWebBase(): string {
  return glAuth()?.baseUrl || "https://gitlab.com";
}

function glApi(): string {
  return `${glWebBase()}/api/v4`;
}

function glHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": "helix-studio" };
  const token = glAuth()?.token;
  if (token) headers["PRIVATE-TOKEN"] = token;
  return headers;
}

async function glJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${glApi()}${path}`, { headers: glHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function glReq(method: string, path: string, body?: unknown): Promise<{ ok: boolean; json: unknown }> {
  try {
    const res = await fetch(`${glApi()}${path}`, {
      method,
      headers: { ...glHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  }
}

/** GitLab error payloads are { message } — sometimes a string, sometimes a map. */
function glError(json: unknown): string {
  const msg = (json as { message?: unknown; error?: unknown } | null)?.message ??
    (json as { error?: unknown } | null)?.error;
  if (typeof msg === "string") return msg;
  if (msg && typeof msg === "object") {
    try {
      return JSON.stringify(msg);
    } catch {
      return "request failed";
    }
  }
  return "request failed";
}

function decodeBase64(content: string | undefined): string | null {
  if (!content) return null;
  try {
    return Buffer.from(content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Repos the token can reach, newest activity first. order_by=last_activity_at
 * sorts descending by default; two pages of 100 caps the picker at ~200.
 */
async function listRepos(): Promise<{ repos: RepoListEntry[] } | { unauthorized: true } | null> {
  if (!glAuth()?.token) return { unauthorized: true };
  const repos: RepoListEntry[] = [];
  try {
    for (let page = 1; page <= 2; page++) {
      const res = await fetch(
        `${glApi()}/projects?membership=true&per_page=100&order_by=last_activity_at&page=${page}`,
        { headers: glHeaders(), cache: "no-store" },
      );
      if (res.status === 401 || res.status === 403) return { unauthorized: true };
      if (!res.ok) return repos.length ? { repos } : null;
      const batch = (await res.json()) as Array<{
        path_with_namespace: string;
        visibility?: string;
        default_branch?: string | null;
        last_activity_at?: string;
      }>;
      for (const p of batch) {
        repos.push({
          repo: p.path_with_namespace,
          // "internal" projects are still invisible to the public internet.
          private: p.visibility === "private" || p.visibility === "internal",
          defaultBranch: p.default_branch ?? "main",
          pushedAt: p.last_activity_at ?? null,
        });
      }
      if (batch.length < 100) break;
    }
    return { repos };
  } catch {
    return null;
  }
}

/**
 * All blob paths on a branch. The tree endpoint paginates at 100, so five
 * pages = the 500-file cap. GitLab tree entries carry no size — reported as 0.
 */
async function fetchRepoTree(repo: string, ref?: string): Promise<{ branch: string; files: RepoTreeEntry[] } | null> {
  const id = encodeURIComponent(repo);
  const project = await glJson<{ default_branch?: string | null }>(`/projects/${id}`);
  if (!project) return null;
  const branch = ref || project.default_branch || "main";
  // No default branch = a project with no commits yet → empty workspace.
  if (!project.default_branch) return { branch, files: [] };

  const files: RepoTreeEntry[] = [];
  for (let page = 1; page <= 5 && files.length < 500; page++) {
    let batch: Array<{ path: string; type: string }>;
    try {
      const res = await fetch(
        `${glApi()}/projects/${id}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}&page=${page}`,
        { headers: glHeaders(), cache: "no-store" },
      );
      // 404 on the tree of a project we can read = empty repo, not missing.
      if (res.status === 404) return { branch, files };
      if (!res.ok) return null;
      batch = (await res.json()) as Array<{ path: string; type: string }>;
    } catch {
      return null;
    }
    for (const e of batch) {
      if (e.type === "blob" && !SKIP.test(e.path) && files.length < 500) files.push({ path: e.path, size: 0 });
    }
    if (batch.length < 100) break;
  }
  return { branch, files };
}

/** Reads one file's text content from a branch. Null if missing/too big/binary. */
async function fetchRepoFileContent(repo: string, path: string, ref?: string): Promise<{ content: string } | null> {
  const id = encodeURIComponent(repo);
  let branch = ref;
  if (!branch) {
    // The files endpoint requires an explicit ref — resolve the default branch.
    const project = await glJson<{ default_branch?: string | null }>(`/projects/${id}`);
    if (!project?.default_branch) return null;
    branch = project.default_branch;
  }
  const data = await glJson<{ content?: string; size?: number }>(
    `/projects/${id}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (!data || data.size === undefined || data.size > 400_000) return null;
  const content = decodeBase64(data.content);
  if (content === null || content.includes("\u0000")) return null;
  return { content };
}

/**
 * Blob paths on a branch, for deciding create vs update in a commit payload
 * (GitLab rejects "create" on an existing path and "update" on a missing one).
 * Bounded at 10 pages (1000 entries); null = couldn't read the branch at all.
 */
async function glBranchPaths(id: string, branch: string): Promise<Set<string> | null> {
  const paths = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    let batch: Array<{ path: string; type: string }>;
    try {
      const res = await fetch(
        `${glApi()}/projects/${id}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}&page=${page}`,
        { headers: glHeaders(), cache: "no-store" },
      );
      if (res.status === 404) return paths; // branch with no files
      if (!res.ok) return null;
      batch = (await res.json()) as Array<{ path: string; type: string }>;
    } catch {
      return null;
    }
    for (const e of batch) if (e.type === "blob") paths.add(e.path);
    if (batch.length < 100) break;
  }
  return paths;
}

/**
 * One commit with files + deletions via POST /repository/commits. A missing
 * target branch is created in the same call with start_branch=<default>. An
 * empty project gets its root commit straight on the default branch name.
 */
async function pushFilesToRepo(
  repo: string,
  opts: PushOpts,
): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }> {
  const id = encodeURIComponent(repo);
  const project = await glJson<{ default_branch?: string | null }>(`/projects/${id}`);
  if (!project)
    return {
      error: `your GitLab token has no access to ${repo} (or it doesn't exist). Reconnect GitLab or check the project path.`,
    };

  // Empty project (no commits): everything is "create", deletions are
  // meaningless, and the commit bootstraps the default branch itself.
  if (!project.default_branch) {
    if (opts.files.length === 0) return { error: "the repo is empty and there are no files to push" };
    const branch = "main";
    const res = await glReq("POST", `/projects/${id}/repository/commits`, {
      branch,
      commit_message: opts.message,
      actions: opts.files.map((f) => ({ action: "create", file_path: f.path, content: f.content })),
    });
    const commit = res.json as { id?: string; web_url?: string } | null;
    if (!res.ok || !commit?.id) return { error: `GitLab rejected the first commit: ${glError(res.json)}` };
    return { branch, commitSha: commit.id, commitUrl: commit.web_url ?? `${glWebBase()}/${repo}/-/commit/${commit.id}` };
  }

  const defaultBranch = project.default_branch;
  const existing = await glJson<{ name?: string }>(
    `/projects/${id}/repository/branches/${encodeURIComponent(opts.branch)}`,
  );
  const branchExists = Boolean(existing?.name);
  const baseBranch = branchExists ? opts.branch : defaultBranch;

  const known = await glBranchPaths(id, baseBranch);
  if (!known) return { error: `couldn't read ${repo}@${baseBranch} to prepare the commit` };

  const actions: Array<{ action: string; file_path: string; content?: string }> = [
    ...opts.files.map((f) => ({
      action: known.has(f.path) ? "update" : "create",
      file_path: f.path,
      content: f.content,
    })),
    // Deleting a path that isn't on the branch fails the whole commit — drop those.
    ...(opts.deletions ?? []).filter((p) => known.has(p)).map((p) => ({ action: "delete", file_path: p })),
  ];
  if (actions.length === 0) return { error: "nothing to commit" };

  const payload: Record<string, unknown> = { branch: opts.branch, commit_message: opts.message, actions };
  if (!branchExists) payload.start_branch = defaultBranch;

  const res = await glReq("POST", `/projects/${id}/repository/commits`, payload);
  const commit = res.json as { id?: string; web_url?: string } | null;
  if (!res.ok || !commit?.id)
    return { error: `GitLab rejected the commit (token may be read-only): ${glError(res.json)}` };
  return {
    branch: opts.branch,
    commitSha: commit.id,
    commitUrl: commit.web_url ?? `${glWebBase()}/${repo}/-/commit/${commit.id}`,
  };
}

/**
 * Creates a project on the authenticated account. initialize_with_readme
 * gives it a default branch so pushFilesToRepo can commit straight to it.
 */
async function createRepo(
  name: string,
  opts: { description?: string; isPrivate?: boolean } = {},
): Promise<{ repo: string; url: string; defaultBranch: string } | { error: string }> {
  const { ok, json } = await glReq("POST", "/projects", {
    name,
    description: opts.description?.slice(0, 200),
    visibility: opts.isPrivate ? "private" : "public",
    initialize_with_readme: true,
  });
  const data = json as { path_with_namespace?: string; web_url?: string; default_branch?: string } | null;
  if (!ok || !data?.path_with_namespace)
    return { error: `couldn't create GitLab project "${name}": ${glError(json)}` };
  return { repo: data.path_with_namespace, url: data.web_url ?? "", defaultBranch: data.default_branch ?? "main" };
}

/** Opens a merge request for an existing branch against the default branch. */
async function createPullRequest(
  repo: string,
  opts: { title: string; body: string; head: string },
): Promise<{ url: string } | { error: string }> {
  const id = encodeURIComponent(repo);
  const project = await glJson<{ default_branch?: string | null }>(`/projects/${id}`);
  if (!project?.default_branch) return { error: `your GitLab token has no access to ${repo} (or it has no commits)` };

  const res = await glReq("POST", `/projects/${id}/merge_requests`, {
    source_branch: opts.head,
    target_branch: project.default_branch,
    title: opts.title,
    description: opts.body,
  });
  const mr = res.json as { web_url?: string } | null;
  if (!res.ok || !mr?.web_url) return { error: `couldn't open the GitLab merge request: ${glError(res.json)}` };
  return { url: mr.web_url };
}

export const gitlabProvider: GitProvider = {
  name: "gitlab",
  listRepos,
  fetchRepoTree,
  fetchRepoFileContent,
  pushFilesToRepo,
  createRepo,
  createPullRequest,
};
