import "server-only";

/**
 * Azure DevOps adapter (REST 7.1, raw fetch). Auth is a PAT sent as Basic
 * with an empty username; the organization comes from auth.org. Repo ids are
 * "org/project/repo" — the org segment is informational (auth.org wins) and
 * project/repo names may contain spaces, so both get URL-encoded.
 */

import {
  activeAuth,
  type GitAuth,
  type GitProvider,
  type PushOpts,
  type RepoListEntry,
  type RepoTreeEntry,
} from "./types";

const API_VERSION = "api-version=7.1";

const ZERO_SHA = "0000000000000000000000000000000000000000";

const SKIP = /(^|\/)(node_modules|dist|build|\.next|vendor|\.git)(\/|$)/;

/** NUL byte — its presence marks a file as binary. */
const NUL = String.fromCharCode(0);

function azAuth(): GitAuth | undefined {
  const auth = activeAuth();
  return auth?.provider === "azure" && auth.org ? auth : undefined;
}

function azBase(): string | null {
  const auth = azAuth();
  return auth ? `https://dev.azure.com/${encodeURIComponent(auth.org ?? "")}` : null;
}

function azHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "helix-studio" };
  const token = azAuth()?.token;
  // PATs ride Basic auth with an empty username.
  if (token) headers.Authorization = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  return headers;
}

/** "org/project/repo" → encoded URL prefix for the repo's git API. */
function azRepoUrl(repo: string): string | null {
  const base = azBase();
  const segs = repo.split("/");
  if (!base || segs.length !== 3) return null;
  return `${base}/${encodeURIComponent(segs[1])}/_apis/git/repositories/${encodeURIComponent(segs[2])}`;
}

function azWebUrl(repo: string): string {
  const auth = azAuth();
  const segs = repo.split("/");
  const project = encodeURIComponent(segs[1] ?? "");
  const name = encodeURIComponent(segs[2] ?? "");
  return `https://dev.azure.com/${encodeURIComponent(auth?.org ?? segs[0] ?? "")}/${project}/_git/${name}`;
}

function stripRefPrefix(ref: string | undefined): string | undefined {
  return ref?.replace(/^refs\/heads\//, "");
}

async function azJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: azHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function azReq(method: string, url: string, body?: unknown): Promise<{ ok: boolean; json: unknown }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { ...azHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: null };
  }
}

/** ADO errors are { message } with a typeKey; keep just the message. */
function azError(json: unknown): string {
  const msg = (json as { message?: unknown } | null)?.message;
  return typeof msg === "string" ? msg : "request failed";
}

/**
 * Every repo across the org. ADO has no server-side activity sort for this
 * endpoint, so we sort by the owning project's lastUpdateTime ourselves. All
 * ADO repos are private to the org — there is no public flag to read.
 */
async function listRepos(): Promise<{ repos: RepoListEntry[] } | { unauthorized: true } | null> {
  const auth = azAuth();
  const base = azBase();
  if (!auth?.token || !base) return { unauthorized: true };
  try {
    const res = await fetch(`${base}/_apis/git/repositories?${API_VERSION}`, {
      headers: azHeaders(),
      cache: "no-store",
    });
    // ADO answers a bad/expired PAT with 401/403 — or 203 + a sign-in page.
    if (res.status === 401 || res.status === 403 || res.status === 203) return { unauthorized: true };
    if (!res.ok) return null;
    const data = (await res.json()) as {
      value?: Array<{
        name?: string;
        defaultBranch?: string;
        isDisabled?: boolean;
        project?: { name?: string; lastUpdateTime?: string };
      }>;
    };
    const repos: RepoListEntry[] = (data.value ?? [])
      .filter((r) => r.name && r.project?.name && !r.isDisabled)
      .map((r) => ({
        repo: `${auth.org}/${r.project?.name}/${r.name}`,
        private: true,
        defaultBranch: stripRefPrefix(r.defaultBranch) ?? "main",
        pushedAt: r.project?.lastUpdateTime ?? null,
      }))
      .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""))
      .slice(0, 200);
    return { repos };
  } catch {
    return null;
  }
}

/**
 * All file paths on a branch via items?recursionLevel=full. ADO paths come
 * back with a leading "/" which is stripped; size can be absent (0).
 */
async function fetchRepoTree(repo: string, ref?: string): Promise<{ branch: string; files: RepoTreeEntry[] } | null> {
  const repoUrl = azRepoUrl(repo);
  if (!repoUrl) return null;
  const meta = await azJson<{ defaultBranch?: string }>(`${repoUrl}?${API_VERSION}`);
  if (!meta) return null;
  // No defaultBranch = a repo with no commits yet → empty workspace.
  if (!meta.defaultBranch) return { branch: ref || "main", files: [] };
  const branch = ref || stripRefPrefix(meta.defaultBranch) || "main";

  let items: { value?: Array<{ path?: string; isFolder?: boolean; size?: number }> };
  try {
    const res = await fetch(
      `${repoUrl}/items?recursionLevel=full&versionDescriptor.version=${encodeURIComponent(branch)}&${API_VERSION}`,
      { headers: azHeaders(), cache: "no-store" },
    );
    // 404 on items of a readable repo = nothing on that ref → empty.
    if (res.status === 404) return { branch, files: [] };
    if (!res.ok) return null;
    items = (await res.json()) as typeof items;
  } catch {
    return null;
  }

  const files: RepoTreeEntry[] = [];
  for (const it of items.value ?? []) {
    if (it.isFolder === true || !it.path) continue;
    const path = it.path.replace(/^\//, "");
    if (!path || SKIP.test(path)) continue;
    files.push({ path, size: it.size ?? 0 });
    if (files.length >= 500) break;
  }
  return { branch, files };
}

/** Reads one file's text via items?includeContent=true (JSON carries raw text). */
async function fetchRepoFileContent(repo: string, path: string, ref?: string): Promise<{ content: string } | null> {
  const repoUrl = azRepoUrl(repo);
  if (!repoUrl) return null;
  // Without a versionDescriptor ADO serves the default branch.
  const version = ref ? `&versionDescriptor.version=${encodeURIComponent(ref)}` : "";
  const data = await azJson<{ content?: string; isFolder?: boolean }>(
    `${repoUrl}/items?path=${encodeURIComponent(`/${path}`)}&includeContent=true&${API_VERSION}${version}`,
  );
  if (!data || data.isFolder === true || typeof data.content !== "string") return null;
  if (data.content.length > 400_000 || data.content.includes(NUL)) return null;
  return { content: data.content };
}

/** Head sha of refs/heads/<branch>, or null. `filter` is a prefix — match exactly. */
async function azBranchHead(repoUrl: string, branch: string): Promise<string | null> {
  const data = await azJson<{ value?: Array<{ name?: string; objectId?: string }> }>(
    `${repoUrl}/refs?filter=${encodeURIComponent(`heads/${branch}`)}&${API_VERSION}`,
  );
  const exact = data?.value?.find((r) => r.name === `refs/heads/${branch}`);
  return exact?.objectId ?? null;
}

/**
 * One push (= one commit) via POST /pushes. ADO needs add vs edit to be
 * right, so the base branch's file list decides per path. A missing target
 * branch is created by naming a new ref with the default head as oldObjectId;
 * an empty repo takes oldObjectId = all zeros on the default branch name.
 */
async function pushFilesToRepo(
  repo: string,
  opts: PushOpts,
): Promise<{ branch: string; commitSha: string; commitUrl: string } | { error: string }> {
  const repoUrl = azRepoUrl(repo);
  if (!repoUrl) return { error: `"${repo}" is not a valid Azure DevOps repo id (expected org/project/repo)` };
  const meta = await azJson<{ defaultBranch?: string }>(`${repoUrl}?${API_VERSION}`);
  if (!meta)
    return {
      error: `your Azure DevOps token has no access to ${repo} (or it doesn't exist). Reconnect Azure DevOps or check the repo id.`,
    };

  let branch = opts.branch;
  let oldObjectId = ZERO_SHA;
  let deletions = opts.deletions ?? [];
  const basePaths = new Set<string>();

  if (!meta.defaultBranch) {
    // Empty repo: the push creates the root commit + the default branch.
    // Everything is an "add"; deletions are meaningless and dropped.
    if (opts.files.length === 0) return { error: "the repo is empty and there are no files to push" };
    branch = "main";
    deletions = [];
  } else {
    const defaultBranch = stripRefPrefix(meta.defaultBranch) ?? "main";
    const existingHead = await azBranchHead(repoUrl, opts.branch);
    let baseBranch = opts.branch;
    if (existingHead) {
      oldObjectId = existingHead;
    } else {
      // New ref: ADO branches it off whatever sha oldObjectId points at.
      const defaultHead = await azBranchHead(repoUrl, defaultBranch);
      if (!defaultHead) return { error: `couldn't resolve the default branch head of ${repo} on Azure DevOps` };
      oldObjectId = defaultHead;
      baseBranch = defaultBranch;
    }

    // add vs edit per path, from the base branch's current file list.
    const items = await azJson<{ value?: Array<{ path?: string; isFolder?: boolean }> }>(
      `${repoUrl}/items?recursionLevel=full&versionDescriptor.version=${encodeURIComponent(baseBranch)}&${API_VERSION}`,
    );
    for (const it of items?.value ?? []) {
      if (it.isFolder !== true && it.path) basePaths.add(it.path.replace(/^\//, ""));
    }
    // Deleting a path that isn't on the branch fails the whole push — drop those.
    deletions = deletions.filter((p) => basePaths.has(p));
  }

  const changes: Array<Record<string, unknown>> = [
    ...opts.files.map((f) => ({
      changeType: basePaths.has(f.path) ? "edit" : "add",
      item: { path: `/${f.path}` },
      newContent: { content: f.content, contentType: "rawtext" },
    })),
    ...deletions.map((p) => ({ changeType: "delete", item: { path: `/${p}` } })),
  ];
  if (changes.length === 0) return { error: "nothing to commit" };

  const push = await azReq("POST", `${repoUrl}/pushes?${API_VERSION}`, {
    refUpdates: [{ name: `refs/heads/${branch}`, oldObjectId }],
    commits: [{ comment: opts.message, changes }],
  });
  const data = push.json as { commits?: Array<{ commitId?: string }> } | null;
  const sha = data?.commits?.[0]?.commitId;
  if (!push.ok || !sha)
    return { error: `Azure DevOps rejected the push (token may be read-only): ${azError(push.json)}` };
  return { branch, commitSha: sha, commitUrl: `${azWebUrl(repo)}/commit/${sha}` };
}

/**
 * Creates a repo in the org's first project (ADO repos must live in one).
 * ADO never auto-inits via REST, so the repo starts empty — pushFilesToRepo
 * bootstraps the root commit. ADO repos have no description field.
 */
// ADO has no description/visibility knobs — repos are org-private, so the
// interface's opts param is simply omitted (TS allows narrower impls).
async function createRepo(
  name: string,
): Promise<{ repo: string; url: string; defaultBranch: string } | { error: string }> {
  const auth = azAuth();
  const base = azBase();
  if (!auth || !base) return { error: "connect Azure DevOps (token + organization) before creating a repo" };

  const projects = await azJson<{ value?: Array<{ id?: string; name?: string }> }>(
    `${base}/_apis/projects?${API_VERSION}&$top=1`,
  );
  const project = projects?.value?.[0];
  if (!project?.name) return { error: "couldn't find an Azure DevOps project to create the repo in" };

  const { ok, json } = await azReq(
    "POST",
    `${base}/${encodeURIComponent(project.name)}/_apis/git/repositories?${API_VERSION}`,
    { name },
  );
  const data = json as { name?: string; webUrl?: string } | null;
  if (!ok || !data?.name) return { error: `couldn't create Azure DevOps repo "${name}": ${azError(json)}` };
  const id = `${auth.org}/${project.name}/${data.name}`;
  return { repo: id, url: data.webUrl ?? azWebUrl(id), defaultBranch: "main" };
}

/** Opens a PR for an existing branch against the default branch. */
async function createPullRequest(
  repo: string,
  opts: { title: string; body: string; head: string },
): Promise<{ url: string } | { error: string }> {
  const repoUrl = azRepoUrl(repo);
  if (!repoUrl) return { error: `"${repo}" is not a valid Azure DevOps repo id (expected org/project/repo)` };
  const meta = await azJson<{ defaultBranch?: string }>(`${repoUrl}?${API_VERSION}`);
  if (!meta?.defaultBranch)
    return { error: `your Azure DevOps token has no access to ${repo} (or the repo has no commits)` };

  const { ok, json } = await azReq("POST", `${repoUrl}/pullrequests?${API_VERSION}`, {
    sourceRefName: `refs/heads/${opts.head}`,
    targetRefName: meta.defaultBranch,
    title: opts.title,
    description: opts.body,
  });
  const pr = json as { pullRequestId?: number } | null;
  if (!ok || !pr?.pullRequestId)
    return { error: `couldn't open the Azure DevOps pull request: ${azError(json)}` };
  return { url: `${azWebUrl(repo)}/pullrequest/${pr.pullRequestId}` };
}

export const azureProvider: GitProvider = {
  name: "azure",
  listRepos,
  fetchRepoTree,
  fetchRepoFileContent,
  pushFilesToRepo,
  createRepo,
  createPullRequest,
};
