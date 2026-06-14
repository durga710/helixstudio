-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceMode" AS ENUM ('SCRATCH', 'IMPORT');

-- CreateEnum
CREATE TYPE "ProjectHealth" AS ENUM ('HEALTHY', 'REVIEW', 'ISSUES');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED', 'AWAITING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('USER', 'PROJECT', 'AGENT');

-- CreateEnum
CREATE TYPE "DeployState" AS ENUM ('READY', 'BUILDING', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'team',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "seats" INTEGER NOT NULL DEFAULT 5,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "starterWorkspaceId" TEXT,
    "lessonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceEvent" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceTask" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "assigneeId" TEXT,
    "createdById" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeployConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeployConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceDeploy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "dashboardUrl" TEXT,
    "productionUrl" TEXT,
    "lastState" TEXT,
    "lastDeployAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceDeploy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceIntent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'agent',
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL DEFAULT '',
    "userRequest" TEXT NOT NULL DEFAULT '',
    "planText" TEXT,
    "reasoning" TEXT,
    "alternatives" TEXT,
    "revertsIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceChange" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "beforeContent" TEXT,
    "afterContent" TEXT,
    "baseUnknown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "submittedAt" TIMESTAMP(3),
    "grade" TEXT,
    "feedback" TEXT,
    "aiReview" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiProvider" TEXT NOT NULL DEFAULT 'openai',
    "aiModel" TEXT NOT NULL DEFAULT '',
    "aiBaseUrl" TEXT,
    "openaiKey" TEXT,
    "anthropicKey" TEXT,
    "localKey" TEXT,
    "geminiKey" TEXT,
    "githubToken" TEXT,
    "gitlabToken" TEXT,
    "gitlabBaseUrl" TEXT,
    "bitbucketToken" TEXT,
    "azureToken" TEXT,
    "azureOrg" TEXT,
    "giteaToken" TEXT,
    "giteaBaseUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "WorkspaceMode" NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'app',
    "gameCategory" TEXT,
    "spaceId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "repo" TEXT,
    "baseBranch" TEXT,
    "notes" TEXT,
    "convoSummary" TEXT,
    "convoSummaryAt" TIMESTAMP(3),
    "setupScript" TEXT,
    "envSnapshotId" TEXT,
    "envSnapshotKey" TEXT,
    "envReadyAt" TIMESTAMP(3),
    "envSandbox" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultText" TEXT,
    "actions" JSONB,
    "changes" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "repo" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "hookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'TypeScript',
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "health" "ProjectHealth" NOT NULL DEFAULT 'REVIEW',
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,

    CONSTRAINT "RepoFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoChunk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "qdrantId" TEXT,

    CONSTRAINT "RepoChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scanSeconds" DOUBLE PRECISION NOT NULL,
    "overview" JSONB NOT NULL,
    "dataFlow" JSONB NOT NULL,
    "deps" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "logs" JSONB NOT NULL,
    "result" TEXT,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEntry" (
    "id" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "env" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "state" "DeployState" NOT NULL DEFAULT 'BUILDING',
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "actorId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Space_joinCode_key" ON "Space"("joinCode");

-- CreateIndex
CREATE INDEX "SpaceMember_userId_idx" ON "SpaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Space_stripeCustomerId_key" ON "Space"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Space_stripeSubscriptionId_key" ON "Space"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Assignment_spaceId_createdAt_idx" ON "Assignment"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_workspaceId_idx" ON "AssignmentSubmission"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_assignmentId_userId_key" ON "AssignmentSubmission"("assignmentId", "userId");

-- CreateIndex
CREATE INDEX "SpaceEvent_spaceId_createdAt_idx" ON "SpaceEvent"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SpaceTask_spaceId_status_order_idx" ON "SpaceTask"("spaceId", "status", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DeployConnection_userId_provider_key" ON "DeployConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "DeployConnection_userId_idx" ON "DeployConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceDeploy_workspaceId_key" ON "WorkspaceDeploy"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceIntent_workspaceId_createdAt_idx" ON "WorkspaceIntent"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceChange_intentId_path_key" ON "WorkspaceChange"("intentId", "path");

-- CreateIndex
CREATE INDEX "WorkspaceChange_workspaceId_path_createdAt_idx" ON "WorkspaceChange"("workspaceId", "path", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "Workspace_userId_updatedAt_idx" ON "Workspace"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Workspace_spaceId_idx" ON "Workspace"("spaceId");

-- CreateIndex
CREATE INDEX "WorkspaceTask_workspaceId_createdAt_idx" ON "WorkspaceTask"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFile_workspaceId_path_key" ON "WorkspaceFile"("workspaceId", "path");

-- CreateIndex
CREATE INDEX "RepoWatch_userId_idx" ON "RepoWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoWatch_provider_repo_key" ON "RepoWatch"("provider", "repo");

-- CreateIndex
CREATE INDEX "WorkspaceMessage_workspaceId_createdAt_idx" ON "WorkspaceMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoFile_projectId_path_key" ON "RepoFile"("projectId", "path");

-- CreateIndex
CREATE INDEX "RepoChunk_projectId_path_idx" ON "RepoChunk"("projectId", "path");

-- CreateIndex
CREATE INDEX "Analysis_projectId_createdAt_idx" ON "Analysis"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatThread_userId_createdAt_idx" ON "ChatThread"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_projectId_createdAt_idx" ON "AgentRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStep_runId_idx" ON "AgentStep"("runId");

-- CreateIndex
CREATE INDEX "MemoryEntry_scope_updatedAt_idx" ON "MemoryEntry"("scope", "updatedAt");

-- CreateIndex
CREATE INDEX "Deployment_projectId_createdAt_idx" ON "Deployment"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_codeHash_key" ON "Invite"("codeHash");

-- CreateIndex
CREATE INDEX "Invite_teamId_status_idx" ON "Invite"("teamId", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_teamId_at_idx" ON "AuditEvent"("teamId", "at");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_starterWorkspaceId_fkey" FOREIGN KEY ("starterWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceEvent" ADD CONSTRAINT "SpaceEvent_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceEvent" ADD CONSTRAINT "SpaceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceTask" ADD CONSTRAINT "SpaceTask_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceTask" ADD CONSTRAINT "SpaceTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeployConnection" ADD CONSTRAINT "DeployConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceDeploy" ADD CONSTRAINT "WorkspaceDeploy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceIntent" ADD CONSTRAINT "WorkspaceIntent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceChange" ADD CONSTRAINT "WorkspaceChange_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "WorkspaceIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFile" ADD CONSTRAINT "WorkspaceFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoWatch" ADD CONSTRAINT "RepoWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoFile" ADD CONSTRAINT "RepoFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoChunk" ADD CONSTRAINT "RepoChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bundle',
    "refreshState" TEXT,
    "refreshError" TEXT,
    "refreshedAt" TIMESTAMP(3),
    "libraryState" JSONB,
    "libraryCheckedAt" TIMESTAMP(3),
    "freshnessError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_templateId_key" ON "Template"("templateId");

-- CreateTable
CREATE TABLE "FileEmbedding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "vector" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileEmbedding_workspaceId_chunkHash_key" ON "FileEmbedding"("workspaceId", "chunkHash");

-- CreateIndex
CREATE INDEX "FileEmbedding_workspaceId_idx" ON "FileEmbedding"("workspaceId");

-- AddForeignKey
ALTER TABLE "FileEmbedding" ADD CONSTRAINT "FileEmbedding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "GodotBuild" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "hash" TEXT,
    "pckKey" TEXT,
    "runtime" TEXT,
    "exportLog" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GodotBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GodotBuild_workspaceId_createdAt_idx" ON "GodotBuild"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "GodotBuild" ADD CONSTRAINT "GodotBuild_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "quizAnswers" JSONB,
    "quizScore" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_updatedAt_idx" ON "LessonProgress"("userId", "updatedAt");

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "spaceId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'space',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "manifest" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lesson_authorId_updatedAt_idx" ON "Lesson"("authorId", "updatedAt");

-- CreateIndex
CREATE INDEX "Lesson_spaceId_status_idx" ON "Lesson"("spaceId", "status");

-- CreateTable
CREATE TABLE "LabWidget" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "spaceId" TEXT,
    "title" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabWidget_authorId_updatedAt_idx" ON "LabWidget"("authorId", "updatedAt");

-- CreateIndex
CREATE INDEX "LabWidget_spaceId_idx" ON "LabWidget"("spaceId");
