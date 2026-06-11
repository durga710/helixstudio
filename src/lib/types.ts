export type Health = "healthy" | "review" | "issues";

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  description: string;
  language: string;
  files: number;
  progress: number;
  health: Health;
  indexedAt: string | null;
}

export type ActivityKind = "merged" | "task" | "review" | "analysis";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  text: string;
  highlight: string;
  at: string;
}

export interface WorkspaceStats {
  repositories: number;
  tasksReady: number;
  coverage: number;
  securityFindings: number;
}

export type RiskSeverity = "high" | "medium" | "low";

export interface AnalysisRisk {
  id: string;
  title: string;
  detail: string;
  severity: RiskSeverity;
  kind: "security" | "performance" | "dependency";
}

export interface DependencyInfo {
  name: string;
  version: string;
  status: "ok" | "warn";
}

export interface AnalysisReport {
  projectId: string;
  scanSeconds: number;
  files: number;
  lastCommit: string;
  overview: Array<{ k: string; v: string }>;
  dataFlow: string[];
  dependencies: DependencyInfo[];
  risks: AnalysisRisk[];
}

export type DeployState = "ready" | "building" | "failed";

export interface DeployEnvironment {
  id: string;
  name: string;
  url: string;
  state: DeployState;
  commit: string;
  branch?: string;
  deployedAt: string;
  region?: string;
  coverage?: number;
}

export interface DeploymentRecord {
  id: string;
  sha: string;
  message: string;
  author: string;
  state: DeployState;
  at: string;
}

export type MemoryScope = "user" | "project" | "agent";

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  title: string;
  content: string;
  updatedAt: string;
}

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export type InviteStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface TeamInvite {
  id: string;
  email: string;
  code: string;
  status: InviteStatus;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

export interface FileLeaf {
  type: "file";
  name: string;
  path: string;
  change?: "M" | "A";
}

export interface FileFolder {
  type: "folder";
  name: string;
  path: string;
  children: FileNode[];
}

export type FileNode = FileLeaf | FileFolder;

export interface SourceFile {
  path: string;
  language: string;
  content: string;
}

export type AgentStatus = "idle" | "active" | "done" | "blocked";

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  notes: string[];
}
