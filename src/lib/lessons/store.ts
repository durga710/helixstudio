/**
 * Lesson store (client-safe; NO server-only imports). v1 is bundle-only — it
 * reads straight from the generated registry. A DB-backed tier (for AI-drafted
 * or teacher-authored lessons) can slot in later behind this same interface,
 * exactly like the template store gained one.
 */

import { LESSONS, LESSON_IDS } from "./registry.generated";
import type { Lesson, LessonManifest } from "./types";

export function getAllLessons(): Lesson[] {
  return LESSON_IDS.map((id) => LESSONS[id]);
}

export function getLessonManifests(): LessonManifest[] {
  return getAllLessons().map((l) => l.manifest);
}

export function getLesson(id: string): Lesson | undefined {
  return LESSONS[id];
}
