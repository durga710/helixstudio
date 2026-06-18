/**
 * Pure scheduler for the parallel worker group. Given the tasks, what's done,
 * and what's currently running, pick the next batch to LAUNCH such that:
 *  - every dependency is satisfied,
 *  - no launched task's scope conflicts with a running OR co-launched task
 *    (so concurrent workers can never touch the same file — no merge needed),
 *  - concurrency stays under the cap.
 * Dependency-free + tested.
 */

import { scopesDisjoint } from "./scope";

export interface SchedTask {
  scope?: string[];
  dependsOn?: number[];
}

export function nextLaunchable(
  tasks: SchedTask[],
  done: Set<number>,
  running: Set<number>,
  cap: number,
): number[] {
  const launch: number[] = [];
  const activeScopes = [...running].map((i) => tasks[i]?.scope ?? []);

  for (let i = 0; i < tasks.length; i++) {
    if (running.size + launch.length >= cap) break;
    if (done.has(i) || running.has(i)) continue;
    const deps = tasks[i]?.dependsOn ?? [];
    if (!deps.every((d) => done.has(d))) continue;
    const sc = tasks[i]?.scope ?? [];
    const conflict = [...activeScopes, ...launch.map((j) => tasks[j]?.scope ?? [])].some(
      (other) => !scopesDisjoint(other, sc),
    );
    if (conflict) continue;
    launch.push(i);
  }
  return launch;
}
