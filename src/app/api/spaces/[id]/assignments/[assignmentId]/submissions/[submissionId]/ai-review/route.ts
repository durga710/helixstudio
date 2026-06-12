/**
 * /api/spaces/[id]/assignments/[assignmentId]/submissions/[submissionId]/ai-review
 * POST: instructor runs a one-shot AI review of the student's submission.
 * Reads the submission workspace's files (SCRATCH overlay = the whole
 * project), reviews with the INSTRUCTOR's configured model/key, persists the
 * text on the submission (NOT in the student's chat — that history feeds
 * their agent context), and meters the instructor's tokens.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getOverlay } from "@/lib/workspace";
import { runReviewer, PROVIDER_DEFAULT_MODEL } from "@/lib/ai-agent";
import { OPENAI_MODEL } from "@/lib/openai";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const REVIEW_TEXT_CAP = 30_000;

type Params = { params: Promise<{ id: string; assignmentId: string; submissionId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id, assignmentId, submissionId } = await params;
  const g = await guard("assignment.review", { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const submission = await db().assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      assignmentId: true,
      workspace: true,
      assignment: {
        select: { spaceId: true, title: true, instructions: true, space: { select: { ownerId: true } } },
      },
    },
  });
  if (
    !submission ||
    submission.assignmentId !== assignmentId ||
    submission.assignment.spaceId !== id ||
    submission.assignment.space.ownerId !== g.user.id
  ) {
    return apiErrors.notFound("Submission");
  }
  if (!submission.workspace) {
    return apiErrors.badRequest("The student's workspace is gone — nothing to review.");
  }

  // Submission workspaces are SCRATCH copies, so the overlay is the project.
  const overlay = await getOverlay(submission.workspace);
  if (overlay.files.length === 0) {
    return apiErrors.badRequest("The submission has no files yet.");
  }
  let reviewText = `ASSIGNMENT: ${submission.assignment.title}\n${submission.assignment.instructions.slice(0, 4_000)}\n\nSUBMITTED FILES:\n\n`;
  for (const f of overlay.files) {
    if (reviewText.length > REVIEW_TEXT_CAP) {
      reviewText += `\n… (${overlay.files.length} files total — remainder omitted for length)\n`;
      break;
    }
    reviewText += `=== ${f.path} ===\n${f.content.slice(0, 12_000)}\n\n`;
  }

  // The instructor's model/key, exactly like the workspace review route.
  const prefs = await db().userPreferences.findUnique({
    where: { userId: g.user.id },
    select: { aiProvider: true, aiModel: true, aiBaseUrl: true, openaiKey: true, anthropicKey: true, localKey: true },
  });
  const provider = prefs?.aiProvider ?? "openai";
  const prefModel = prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? "");
  const model = prefModel || PROVIDER_DEFAULT_MODEL[provider] || OPENAI_MODEL;
  const apiKey =
    (provider === "openai" ? prefs?.openaiKey : provider === "anthropic" ? prefs?.anthropicKey : prefs?.localKey) ||
    undefined;

  const result = await runReviewer({
    provider,
    model,
    apiKey,
    baseUrl: prefs?.aiBaseUrl || "http://localhost:1234/v1",
    diffText: reviewText.slice(0, REVIEW_TEXT_CAP + 2_000),
    system:
      "You are a teaching assistant reviewing a student's submitted code against the assignment brief. " +
      "Assess: does it meet the requirements, does it work, is it well structured? Note genuine bugs or gaps " +
      "with file references, then call out one or two things done well. Be concise (bullets), constructive, and " +
      "specific. End with exactly one line: 'Summary: <one sentence for the instructor>'.",
  });
  if ("error" in result) return apiErrors.badRequest(result.error);

  await db().$transaction([
    db().assignmentSubmission.update({
      where: { id: submission.id },
      data: { aiReview: result.text },
    }),
    db().user.update({ where: { id: g.user.id }, data: { tokensUsed: { increment: result.tokensUsed } } }),
  ]);

  return ok({ text: result.text });
}
