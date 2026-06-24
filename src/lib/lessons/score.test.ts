/**
 * Authoritative lesson-scoring tests. Run:
 *   node --experimental-strip-types --test src/lib/lessons/score.test.ts
 *
 * Security invariant (QA-2026-06-23 C2): the grade is recomputed server-side
 * from the student's picked answers — a forged client `quizScore` is irrelevant
 * because the score function never sees it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreLessonQuiz, scoredStepCount } from "./score.ts";
import type { Lesson } from "./types.ts";

const lesson: Lesson = {
  manifest: {
    id: "t",
    title: "T",
    blurb: "b",
    level: "beginner",
    estMinutes: 5,
    icon: "Sparkles",
    concept: "classification",
    order: 0,
  },
  steps: [
    { kind: "explain", body: "intro" }, // index 0 — not scored
    { kind: "quiz", question: "q1", choices: ["a", "b", "c"], answer: 1 }, // index 1
    { kind: "widget", widget: "sort-game" }, // index 2 — not scored
    { kind: "quiz", question: "q2", choices: ["a", "b"], answer: 0 }, // index 3
    {
      kind: "reflect",
      prompt: "explain back",
      recall: { question: "r", choices: ["x", "y"], answer: 1 }, // index 4
    },
  ],
};

test("scoredStepCount counts quizzes + reflect recalls only", () => {
  assert.equal(scoredStepCount(lesson), 3);
});

test("all correct → 1.0", () => {
  assert.equal(scoreLessonQuiz(lesson, { "1": 1, "3": 0, "4": 1 }), 1);
});

test("partial → fraction of scored steps", () => {
  // 1 of 3 correct
  assert.equal(scoreLessonQuiz(lesson, { "1": 1, "3": 1, "4": 0 }), 1 / 3);
});

test("a forged-but-empty answer set scores 0, not the client's claimed 100%", () => {
  // The exploit: client claimed quizScore=1 but supplied no real answers.
  assert.equal(scoreLessonQuiz(lesson, {}), 0);
  assert.equal(scoreLessonQuiz(lesson, undefined), 0);
});

test("wrong key types / out-of-range picks count as wrong, never throw", () => {
  assert.equal(scoreLessonQuiz(lesson, { "1": 99, "3": -1, "4": 5 }), 0);
});

test("a lesson with no scored steps is a pass (1.0), matching the client", () => {
  const noQuiz: Lesson = { ...lesson, steps: [{ kind: "explain", body: "x" }] };
  assert.equal(scoredStepCount(noQuiz), 0);
  assert.equal(scoreLessonQuiz(noQuiz, undefined), 1);
});
