import "server-only";

/**
 * Bitbucket Cloud adapter (REST 2.0, raw fetch). Auth is an Atlassian API
 * token sent as a Bearer header. Repo ids are "workspace/repo_slug". List
 * endpoints paginate via absolute `next` links rather than page numbers.
 */

import {
  activeAuth,
  type GitAuth,
  type GitProvider,
  type PushOpts,
  type RepoListEntry,
  type RepoTreeEntry,
} from "./types";

const BB_API = "https://api.bitbucket.org/2.0";

const SKIP = /(^|\/)(node_modules|dist|build|\.next|vendor|\.git)(\/|$)/;

/** NUL byte — its presence marks a file as binary. */
const NUL = String.fromCharCode(0);

function bbAuth(): GitAuth | undefined {
  const auth = activeAuth();
  return auth?.provider === "bitbucket" ? auth : undefined;
}

function bbHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "helix-studio" };
  const token = bbAuth()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** "workspace/repo_slug" with each segment encoded for use in URL paths. */
function bbRepoPath(repo: string): string {
  return repo.split("/").map(encodeURIComponent).join("/");
}

/** Accepts API-relative paths or the absolute URLs from `next` links. */
async function bbJson<T>(pathOrUrl: string): Promise<T | null> {
  try {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BB_API}${pathOrUrl}`;
    const res = await fetch(url, { headers: bbHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function bbReq(method: string, path: string, body?: unknown): Promise<{ ok: boolean; json: unknown }> {
  try {
    const res = await fetch(`${BB_API}${path}`, {
      method,
      headers: { ...bbHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  }
}

/** Bitbucket errors look like { type: "error", error: { message } }. */
function bbError(json: unknown): string {
  const err = (json as { error?: { message?: unknown } } | null)?.error;
  if (typeof err?.message === "string") return err.message;
  return "request failed";
}

/** Repos the token can reach, newest activity first (sort=-updated_on). */
async function listRepos(): Promise<{ repos: RepoListEntry[] } | { unauthorized: true } | null> {
  if (!bbAuth()?.token) return { unauthorized: true };
  const repos: RepoListEntry[] = [];
  let url = `${BB_API}/repositories?role=member&pagelen=100&sort=-updated_on`;
  try {
    // Two pages of 100 caps the picker at ~200 repos.
    for (let i = 0; i < 2 && url; i++) {
      const res = await fetch(url, { headers: bbHeaders(), cache: "no-store" });
      if (res.status === 401 || res.status === 403) return { unauthorized: true };
      if (!res.ok) return repos.length ? { repos } : null;
      const page = (await res.json()) as {
        values?: Array<{
          full_name?: string;
          is_private?: boolean;
          mainbranch?: { name?: string } | null;
          updated_on?: string;
        }>;
        next?: string;
      };
      for (const r of page.values ?? []) {
        if (!r.full_name) continue;
        repos.push({
          repo: r.full_name,
          private: r.is_private ?? true,
          defaultBranch: r.mainbranch?.name ?? "main",
          pushedAt: r.updated_on ?? null,
        });
      }
      url = page.next ?? "";
    }
    return { repos };
  } catch {
    return null;
  }
}

/**
 * All file paths on a branch via the /src listing (q=type="commit_file"
 * filters directories server-side; max_depth=8 recurses). Follows `next`
 * links, bounded, until the 500-file cap.
 */
async function fetchRepoTree(repo: string, ref?: string): Promise<{ branch: string; files: RepoTreeEntry[] } | null> {
  const rp = bbRepoPath(repo);
  const meta = await bbJson<{ mainbranch?: { name?: string } | null }>(`/repositories/${rp}`);
  if (!meta) return null;
  const branch = ref || meta.mainbranch?.name || "main";
  // No mainbranch = a repo that has never been pushed to → empty workspace.
  if (!meta.mainbranch?.name) return { branch, files: [] };

  const files: RepoTreeEntry[] = [];
  let url =
    `${BB_API}/repositories/${rp}/src/${encodeURIComponent(branch)}/` +
    `?max_depth=8&pagelen=100&q=${encodeURIComponent('type="commit_file"')}`;
  for (let i = 0; i < 6 && url && files.length < 500; i++) {
    let page: { values?: Array<{ path?: string; size?: number }>; next?: string };
    try {
      const res = await fetch(url, { headers: bbHeaders(), cache: "no-store" });
      // 404 on /src of a readable repo = no commits on that ref → empty.
      if (res.status === 404) return { branch, files };
      if (!res.ok) return null;
      page = (await res.json()) as typeof page;
    } catch {
      return null;
    }
    for (const e of page.values ?? []) {
      if (e.path && !SKIP.test(e.path) && files.length < 500) files.push({ path: e.path, size: e.size ?? 0 });
    }
    url = page.next ?? "";
  }
  return { branch, files };
}

/**
 * Reads one file's text from a branch — /src/<ref>/<path> returns the RAW
 * body, not JSON. Null if missing, binary, or over the size cap.
 */
async function fetchRepoFileContent(repo: string, path: string, ref?: string): Promise<{ content: string } | null> {
  const rp = bbRepoPath(repo);
  let branch = ref;
  if (!branch) {
    const meta = await bbJson<{ mainbranch?: { name?: string } | null }>(`/repositories/${rp}`);
    if (!meta?.mainbranch?.name) return null;
    branch = meta.mainbranch.name;
  }
  const encPath = path.split("/").map(encodeURIComponent).join("/");
  try {
    const res = await fetch(`${BB_API}/repositories/${rp}/src/${encodeURIComponent(branch)}/${encPath}`, {
      headers: bbHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > 400_000) return null;
    const content = await res.text();
    if (content.length > 400_000 || content.includes(NUL)) return null;
    return { content };
  } catch {
    return null;
  }
}

/**
 * One commit with files + deletions via POST /src (form-encoded: each file is
 * a <path>=<content> field, each deletion a files=<path> field). A new branch
 * needs `parents` pinned to the default branch head; an empty repo just takes
 * the root commit on the default branch name.
 */
async function pushFilesToRepo(
  repo: string,
  opts: PushOpts,
): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }> {
  const rp = bbRepoPath(repo);
  const meta = await bbJson<{ mainbranch?: { name?: string } | null }>(`/repositories/${rp}`);
  if (!meta)
    return {
      error: `your Bitbucket token has no access to ${repo} (or it doesn't exist). Reconnect Bitbucket or check the repo name.`,
    };

  const defaultBranch = meta.mainbranch?.name;
  const empty = !defaultBranch;
  // Empty repo: the first POST /src creates the root commit and the branch.
  // Deletions are meaningless there and are dropped.
  const target = empty ? "main" : opts.branch;
  if (empty && opts.files.length === 0) return { error: "the repo is empty and there are no files to push" };

  const form = new URLSearchParams();
  form.set("message", opts.message);
  form.set("branch", target);

  if (!empty && opts.branch !== defaultBranch) {
    const existing = await bbJson<{ name?: string }>(
      `/repositories/${rp}/refs/branches/${encodeURIComponent(opts.branch)}`,
    );
    if (!existing?.name) {
      // New branch: pin the parent to the default branch head explicitly.
      const head = await bbJson<{ target?: { hash?: string } }>(
        `/repositories/${rp}/refs/branches/${encodeURIComponent(defaultBranch ?? "")}`,
      );
      if (!head?.target?.hash) return { error: `couldn't resolve the default branch head of ${repo} on Bitbucket` };
      form.set("parents", head.target.hash);
    }
  }

  for (const f of opts.files) form.append(f.path, f.content);
  if (!empty) for (const p of opts.deletions ?? []) form.append("files", p);

  try {
    const res = await fetch(`${BB_API}/repositories/${rp}/src`, {
      method: "POST",
      headers: { ...bbHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      return { error: `Bitbucket rejected the commit (token may be read-only): ${bbError(json)}` };
    }
  } catch {
    return { error: "couldn't reach Bitbucket to push the commit" };
  }

  // POST /src returns 201 with an empty body — look up the new head for the sha.
  const commits = await bbJson<{ values?: Array<{ hash?: string; links?: { html?: { href?: string } } }> }>(
    `/repositories/${rp}/commits/${encodeURIComponent(target)}?pagelen=1`,
  );
  const sha = commits?.values?.[0]?.hash ?? "";
  const commitUrl =
    commits?.values?.[0]?.links?.html?.href ?? (sha ? `https://bitbucket.org/${repo}/commits/${sha}` : "");
  return { branch: target, commitSha: sha, commitUrl };
}

/**
 * Creates a repo in the token's first owned workspace (Bitbucket repos always
 * live inside a workspace). No auto-init support — the repo starts empty and
 * pushFilesToRepo bootstraps the root commit.
 */
async function createRepo(
  name: string,
  opts: { description?: string; isPrivate?: boolean } = {},
): Promise<{ repo: string; url: string; defaultBranch: string } | { error: string }> {
  const ws = await bbJson<{ values?: Array<{ slug?: string }> }>(`/workspaces?pagelen=1&role=owner`);
  const workspace = ws?.values?.[0]?.slug;
  if (!workspace) return { error: "couldn't find a Bitbucket workspace your token owns" };

  const slug = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
  const { ok, json } = await bbReq("POST", `/repositories/${workspace}/${encodeURIComponent(slug)}`, {
    scm: "git",
    is_private: opts.isPrivate ?? false,
    description: opts.description?.slice(0, 200),
  });
  const data = json as {
    full_name?: string;
    links?: { html?: { href?: string } };
    mainbranch?: { name?: string } | null;
  } | null;
  if (!ok || !data?.full_name) return { error: `couldn't create Bitbucket repo "${name}": ${bbError(json)}` };
  return {
    repo: data.full_name,
    url: data.links?.html?.href ?? `https://bitbucket.org/${data.full_name}`,
    defaultBranch: data.mainbranch?.name ?? "main",
  };
}

/** Opens a PR for an existing branch against the default branch. */
async function createPullRequest(
  repo: string,
  opts: { title: string; body: string; head: string },
): Promise<{ url: string } | { error: string }> {
  const rp = bbRepoPath(repo);
  const meta = await bbJson<{ mainbranch?: { name?: string } | null }>(`/repositories/${rp}`);
  if (!meta) return { error: `your Bitbucket token has no access to ${repo} (or it doesn't exist)` };

  const { ok, json } = await bbReq("POST", `/repositories/${rp}/pullrequests`, {
    title: opts.title,
    description: opts.body,
    source: { branch: { name: opts.head } },
    destination: { branch: { name: meta.mainbranch?.name ?? "main" } },
  });
  const pr = json as { links?: { html?: { href?: string } } } | null;
  if (!ok || !pr?.links?.html?.href) return { error: `couldn't open the Bitbucket pull request: ${bbError(json)}` };
  return { url: pr.links.html.href };
}

export const bitbucketProvider: GitProvider = {
  name: "bitbucket",
  listRepos,
  fetchRepoTree,
  fetchRepoFileContent,
  pushFilesToRepo,
  createRepo,
  createPullRequest,
};
