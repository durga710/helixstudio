/* Workspace data service.
 *
 * Runs against a seeded in-memory store so the whole product works with zero
 * external services ("demo mode"). When DATABASE_URL is configured, the same
 * interface is the swap point for the Prisma-backed implementation
 * (prisma/schema.prisma models every entity here) — see docs/DATABASE.md.
 */

import {
  seedActivity,
  seedAgents,
  seedAnalysis,
  seedAudit,
  seedDeployments,
  seedEnvironments,
  seedFiles,
  seedInvites,
  seedMembers,
  seedMemory,
  seedProjects,
  seedStats,
  seedTree,
} from "./demo-seed";
import type {
  ActivityItem,
  AgentInfo,
  AnalysisReport,
  AuditEvent,
  DeployEnvironment,
  DeploymentRecord,
  FileNode,
  MemoryEntry,
  MemoryScope,
  Project,
  SourceFile,
  TeamInvite,
  TeamMember,
  TeamRole,
  WorkspaceStats,
} from "./types";

interface WorkspaceData {
  projects: Project[];
  activity: ActivityItem[];
  stats: WorkspaceStats;
  analysis: AnalysisReport;
  environments: DeployEnvironment[];
  deployments: DeploymentRecord[];
  memory: MemoryEntry[];
  members: TeamMember[];
  invites: TeamInvite[];
  audit: AuditEvent[];
  agents: AgentInfo[];
  tree: FileNode[];
  files: SourceFile[];
  disabledSkills: Set<string>;
}

function createStore(): WorkspaceData {
  return {
    projects: [...seedProjects],
    activity: [...seedActivity],
    stats: { ...seedStats },
    analysis: structuredClone(seedAnalysis),
    environments: structuredClone(seedEnvironments),
    deployments: [...seedDeployments],
    memory: [...seedMemory],
    members: [...seedMembers],
    invites: [...seedInvites],
    audit: [...seedAudit],
    agents: structuredClone(seedAgents),
    tree: structuredClone(seedTree),
    files: [...seedFiles],
    disabledSkills: new Set(),
  };
}

// Survives dev-server HMR and per-route module instances.
const globalStore = globalThis as unknown as { __helixStore?: WorkspaceData };

export function store(): WorkspaceData {
  globalStore.__helixStore ??= createStore();
  return globalStore.__helixStore;
}

const id = () => Math.random().toString(36).slice(2, 10);

export function logAudit(actor: string, action: string, target: string) {
  store().audit.unshift({ id: id(), actor, action, target, at: new Date().toISOString() });
}

export function addActivity(item: Omit<ActivityItem, "id" | "at">) {
  store().activity.unshift({ ...item, id: id(), at: new Date().toISOString() });
}

export function addProject(input: { name: string; repoUrl: string; description?: string }): Project {
  const project: Project = {
    id: `${input.name}-${id()}`,
    name: input.name,
    repoUrl: input.repoUrl,
    description: input.description ?? "Imported repository — indexing queued.",
    language: "TypeScript",
    files: 0,
    progress: 0,
    health: "review",
    indexedAt: null,
  };
  store().projects.unshift(project);
  store().stats.repositories += 1;
  addActivity({ kind: "analysis", text: "Repository queued for indexing:", highlight: input.name });
  return project;
}

export function upsertMemory(input: { id?: string; scope: MemoryScope; title: string; content: string }): MemoryEntry {
  const s = store();
  if (input.id) {
    const existing = s.memory.find((m) => m.id === input.id);
    if (existing) {
      existing.title = input.title;
      existing.content = input.content;
      existing.scope = input.scope;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }
  }
  const entry: MemoryEntry = {
    id: id(),
    scope: input.scope,
    title: input.title,
    content: input.content,
    updatedAt: new Date().toISOString(),
  };
  s.memory.unshift(entry);
  return entry;
}

export function deleteMemory(entryId: string): boolean {
  const s = store();
  const before = s.memory.length;
  s.memory = s.memory.filter((m) => m.id !== entryId);
  return s.memory.length < before;
}

export function createInvite(email: string, actor: string): TeamInvite {
  const code = `HX${Math.random().toString(36).slice(2, 4).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const invite: TeamInvite = {
    id: id(),
    email,
    code,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  store().invites.unshift(invite);
  logAudit(actor, "invited member", email);
  return invite;
}

export function revokeInvite(inviteId: string, actor: string): TeamInvite | null {
  const invite = store().invites.find((i) => i.id === inviteId);
  if (!invite) return null;
  invite.status = "REVOKED";
  logAudit(actor, "revoked invite", invite.email);
  return invite;
}

export function setMemberRole(memberId: string, role: TeamRole, actor: string): TeamMember | null {
  const member = store().members.find((m) => m.id === memberId);
  if (!member || member.role === "OWNER") return null;
  member.role = role;
  logAudit(actor, "changed role", `${member.email} → ${role}`);
  return member;
}

export function getFile(path: string): SourceFile | undefined {
  return store().files.find((f) => f.path === path);
}
