/* Additive, idempotent upgrades applied to an ALREADY-provisioned database
 * (fresh databases get the full SCHEMA_SQL instead and never run these).
 * Every statement must be safe to re-run: IF NOT EXISTS / guarded DO blocks
 * only — never destructive. Append new feature blocks at the end. */

export const UPGRADE_SQL = `
-- 2026-06 · Helix Space (Space, SpaceMember, Workspace.spaceId)
CREATE TABLE IF NOT EXISTS "Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SpaceMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Space_joinCode_key" ON "Space"("joinCode");
CREATE INDEX IF NOT EXISTS "SpaceMember_userId_idx" ON "SpaceMember"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId");
CREATE INDEX IF NOT EXISTS "Workspace_spaceId_idx" ON "Workspace"("spaceId");

DO $$ BEGIN
  ALTER TABLE "Space" ADD CONSTRAINT "Space_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Space v2 (classroom kind, assignments, billing)
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'team';
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "seats" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Assignment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "starterWorkspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssignmentSubmission" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "Space_stripeCustomerId_key" ON "Space"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Space_stripeSubscriptionId_key" ON "Space"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "Assignment_spaceId_createdAt_idx" ON "Assignment"("spaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssignmentSubmission_workspaceId_idx" ON "AssignmentSubmission"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentSubmission_assignmentId_userId_key" ON "AssignmentSubmission"("assignmentId", "userId");

DO $$ BEGIN
  ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_starterWorkspaceId_fkey" FOREIGN KEY ("starterWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Space v3 (activity feed, task board)
CREATE TABLE IF NOT EXISTS "SpaceEvent" (
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

CREATE TABLE IF NOT EXISTS "SpaceTask" (
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

CREATE INDEX IF NOT EXISTS "SpaceEvent_spaceId_createdAt_idx" ON "SpaceEvent"("spaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "SpaceTask_spaceId_status_order_idx" ON "SpaceTask"("spaceId", "status", "order");

DO $$ BEGIN
  ALTER TABLE "SpaceEvent" ADD CONSTRAINT "SpaceEvent_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SpaceEvent" ADD CONSTRAINT "SpaceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SpaceTask" ADD CONSTRAINT "SpaceTask_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SpaceTask" ADD CONSTRAINT "SpaceTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Intent ledger (WorkspaceIntent, WorkspaceChange)
CREATE TABLE IF NOT EXISTS "WorkspaceIntent" (
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

CREATE TABLE IF NOT EXISTS "WorkspaceChange" (
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

CREATE INDEX IF NOT EXISTS "WorkspaceIntent_workspaceId_createdAt_idx" ON "WorkspaceIntent"("workspaceId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceChange_intentId_path_key" ON "WorkspaceChange"("intentId", "path");
CREATE INDEX IF NOT EXISTS "WorkspaceChange_workspaceId_path_createdAt_idx" ON "WorkspaceChange"("workspaceId", "path", "createdAt");

DO $$ BEGIN
  ALTER TABLE "WorkspaceIntent" ADD CONSTRAINT "WorkspaceIntent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkspaceChange" ADD CONSTRAINT "WorkspaceChange_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "WorkspaceIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Deploy integrations (DeployConnection, WorkspaceDeploy)
CREATE TABLE IF NOT EXISTS "DeployConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkspaceDeploy" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceDeploy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeployConnection_userId_provider_key" ON "DeployConnection"("userId", "provider");
CREATE INDEX IF NOT EXISTS "DeployConnection_userId_idx" ON "DeployConnection"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceDeploy_workspaceId_key" ON "WorkspaceDeploy"("workspaceId");

DO $$ BEGIN
  ALTER TABLE "DeployConnection" ADD CONSTRAINT "DeployConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkspaceDeploy" ADD CONSTRAINT "WorkspaceDeploy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Tiered token limits + admin user management (tier, quotas,
-- suspension, user-level Stripe, AiUsageEvent history)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenLimit" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "periodTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "provider" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "tokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

DO $$ BEGIN
  ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Scaffold templates (DB-backed; seeded from the bundle, refreshed by the admin job)
CREATE TABLE IF NOT EXISTS "Template" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bundle',
    "refreshState" TEXT,
    "refreshError" TEXT,
    "refreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Template_templateId_key" ON "Template"("templateId");

-- 2026-06 · Gemini provider (per-user key)
ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "geminiKey" TEXT;

-- 2026-06 · Semantic code search (Phase B) — cached chunk embeddings
CREATE TABLE IF NOT EXISTS "FileEmbedding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "vector" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FileEmbedding_workspaceId_chunkHash_key" ON "FileEmbedding"("workspaceId", "chunkHash");
CREATE INDEX IF NOT EXISTS "FileEmbedding_workspaceId_idx" ON "FileEmbedding"("workspaceId");

DO $$ BEGIN
  ALTER TABLE "FileEmbedding" ADD CONSTRAINT "FileEmbedding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · Godot web-export builds (Game Agent Phase 2)
CREATE TABLE IF NOT EXISTS "GodotBuild" (
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

CREATE INDEX IF NOT EXISTS "GodotBuild_workspaceId_createdAt_idx" ON "GodotBuild"("workspaceId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "GodotBuild" ADD CONSTRAINT "GodotBuild_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2026-06 · AI Lab lesson progress
CREATE TABLE IF NOT EXISTS "LessonProgress" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");
CREATE INDEX IF NOT EXISTS "LessonProgress_userId_updatedAt_idx" ON "LessonProgress"("userId", "updatedAt");

-- 2026-06 · AI Lab authored lessons (teacher/AI-made)
CREATE TABLE IF NOT EXISTS "Lesson" (
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

CREATE INDEX IF NOT EXISTS "Lesson_authorId_updatedAt_idx" ON "Lesson"("authorId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Lesson_spaceId_status_idx" ON "Lesson"("spaceId", "status");

-- 2026-06 · Lesson assignments (assign a lesson as graded homework)
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "lessonId" TEXT;

-- 2026-06 · Rolling conversation memory (smart AI compaction for long chats)
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "convoSummary" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "convoSummaryAt" TIMESTAMP(3);

-- 2026-06 · Editor mode (app | game) — drives per-mode editor panels
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'app';

-- 2026-06 · Premium template library freshness (weekly version bumps + build-check)
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "libraryState" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "libraryCheckedAt" TIMESTAMP(3);
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "freshnessError" TEXT;

-- 2026-06 · Workspace sub-type (game category) — mode-specific editor without preloading
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "gameCategory" TEXT;

-- 2026-06 · AI Lab teacher widget library (saved configurable widget instances)
CREATE TABLE IF NOT EXISTS "LabWidget" (
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

CREATE INDEX IF NOT EXISTS "LabWidget_authorId_updatedAt_idx" ON "LabWidget"("authorId", "updatedAt");
CREATE INDEX IF NOT EXISTS "LabWidget_spaceId_idx" ON "LabWidget"("spaceId");

-- 2026-06 · Persisted synthesized build-chat summary (so reloads match the live
-- narration: content holds the model's raw reply, summary holds our own prose).
-- WorkspaceMessage is a HOT table (the chat reads/writes it constantly), so a
-- bare "ADD COLUMN IF NOT EXISTS" still grabs ACCESS EXCLUSIVE on every boot
-- (even as a no-op) and contends with live traffic. Guard it with a lock-free
-- information_schema check so once the column exists, boots take NO exclusive
-- lock here at all — only the very first apply does.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WorkspaceMessage' AND column_name = 'summary'
  ) THEN
    ALTER TABLE "WorkspaceMessage" ADD COLUMN "summary" TEXT;
  END IF;
END $$;

-- 2026-06 · Durable multi-step jobs (planner→workers→reviewer). The whole job
-- state machine rides in one JSONB column on WorkspaceTask. Lock-free guard so
-- repeat boots take no exclusive lock once the column exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WorkspaceTask' AND column_name = 'job'
  ) THEN
    ALTER TABLE "WorkspaceTask" ADD COLUMN "job" JSONB;
  END IF;
END $$;

-- 2026-06 · Community (CommunityPost + CommunityLike). A published project in
-- the /community gallery: kind="app" → workspaceId; kind="video" → embedUrl.
CREATE TABLE IF NOT EXISTS "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workspaceId" TEXT,
    "embedUrl" TEXT,
    "embedProvider" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommunityPost_hidden_createdAt_idx" ON "CommunityPost"("hidden", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityPost_hidden_likeCount_idx" ON "CommunityPost"("hidden", "likeCount");
CREATE INDEX IF NOT EXISTS "CommunityPost_workspaceId_idx" ON "CommunityPost"("workspaceId");
DO $$ BEGIN
  ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CommunityLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommunityLike_postId_userId_key" ON "CommunityLike"("postId", "userId");
CREATE INDEX IF NOT EXISTS "CommunityLike_userId_idx" ON "CommunityLike"("userId");
DO $$ BEGIN
  ALTER TABLE "CommunityLike" ADD CONSTRAINT "CommunityLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CommunityLike" ADD CONSTRAINT "CommunityLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
