import "server-only";

/**
 * Single source of truth for picking a new project's starter template + applying
 * the premium upgrade. Used at workspace creation (POST /api/workspaces) AND on
 * the first build turn of an empty workspace (agent-turn.ts), so a project gets
 * its premium skeleton no matter how it was started.
 */

import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { classifyPrompt, classifyGameTemplate } from "@/lib/templates/router";
import { templateForCategory, templateForEngine } from "@/lib/templates/engines";

/** Paid/admin users get the premium, themeable skeleton for the chosen framework;
 * guests/free get the clean basic one (the deliberate upsell). */
export const PREMIUM_VARIANT: Record<string, string> = {
  "static-web": "static-premium",
  "nextjs-app": "nextjs-premium",
  "express-api": "express-premium",
  "game-2d": "game-2d-premium",
  "game-3d": "game-3d-premium",
  "game-3d-pc": "game-3d-premium",
};

export async function isPremiumUser(userId: string, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const u = await db().user.findUnique({ where: { id: userId }, select: { tier: true, isGuest: true, email: true } });
  if (!u) return false;
  if (isAdminEmail(u.email)) return true; // works without the caller plumbing email
  return !u.isGuest && (u.tier === "pro" || u.tier === "team");
}

export interface ResolveOpts {
  prompt?: string;
  userId: string;
  userEmail?: string | null;
  buildKind?: "app" | "game";
  gameCategory?: string;
  engineOverride?: string;
  buildMode?: "web" | "game2d" | "game3d";
  /** An explicit template id (wins over classification). */
  templateId?: string;
}

/**
 * Resolve the premium-gated starter template id for a new project — or undefined
 * if nothing matches (→ blank workspace). 0-token except the app/game prompt
 * classifier, which is rules-first with a tiny optional model call.
 */
export async function resolveTemplateId(opts: ResolveOpts): Promise<string | undefined> {
  let templateId = opts.templateId;
  const promptText = opts.prompt?.trim();
  const { buildKind, gameCategory, engineOverride, buildMode } = opts;

  // Highest precedence first (all 0-token):
  if (!templateId && engineOverride && isAdminEmail(opts.userEmail)) {
    templateId = templateForEngine(engineOverride) ?? undefined;
  }
  if (!templateId && gameCategory) {
    templateId = templateForCategory(gameCategory) ?? undefined;
  }
  if (!templateId && buildKind === "game" && promptText) {
    try {
      templateId = await classifyGameTemplate(promptText);
    } catch {
      templateId = "game-2d";
    }
  }
  if (!templateId) {
    if (buildMode === "game2d") templateId = "game-2d";
    else if (buildMode === "game3d") templateId = "game-3d";
  }
  if (!templateId && buildKind !== "game" && promptText) {
    try {
      templateId = (await classifyPrompt(promptText, opts.userId)).templateId;
    } catch {
      // classifier unavailable → blank workspace (today's behavior)
    }
  }

  // Premium upgrade to the themeable skeleton.
  if (templateId && PREMIUM_VARIANT[templateId] && (await isPremiumUser(opts.userId, opts.userEmail))) {
    templateId = PREMIUM_VARIANT[templateId];
  }
  return templateId;
}
