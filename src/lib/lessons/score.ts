/**
 * Server-side authoritative scoring for lesson quizzes.
 *
 * The client (lesson-runner) must NOT be trusted to report its own grade — a
 * student can POST any `quizScore`. Instead the client sends the picked answer
 * per scored step (`quizAnswers`) and the server recomputes the score against
 * the lesson's stored correct answers here.
 *
 * Mirrors the client's scoring model: the scored steps are `quiz` and the
 * recall half of `reflect`; score = correct / scoredCount, and a lesson with no
 * scored steps is treated as a pass (1.0), matching lesson-runner.
 */

import type { Lesson, LessonStep } from "./types";

/** `quizAnswers` maps a step index (stringified) to the choice index the
 * student picked. Built client-side from the per-step answer state. */
export type QuizAnswers = Record<string, number>;

/** The correct choice index for a scored step, or undefined if not scored. */
function correctAnswerFor(step: LessonStep): number | undefined {
  if (step.kind === "quiz") return step.answer;
  if (step.kind === "reflect") return step.recall.answer;
  return undefined;
}

/** Number of steps that count toward the score (quizzes + reflect recalls). */
export function scoredStepCount(lesson: Lesson): number {
  return lesson.steps.reduce((n, s) => n + (correctAnswerFor(s) === undefined ? 0 : 1), 0);
}

/**
 * Recompute the authoritative quiz score in [0, 1] from the student's picked
 * answers. Never throws; a missing/odd `answers` entry simply counts as wrong.
 */
export function scoreLessonQuiz(lesson: Lesson, answers: QuizAnswers | undefined): number {
  let scored = 0;
  let correct = 0;
  for (let i = 0; i < lesson.steps.length; i++) {
    const answer = correctAnswerFor(lesson.steps[i]);
    if (answer === undefined) continue;
    scored++;
    if (answers && answers[String(i)] === answer) correct++;
  }
  return scored > 0 ? correct / scored : 1;
}
