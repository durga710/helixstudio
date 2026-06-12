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
`;
