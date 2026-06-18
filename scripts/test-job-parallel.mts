// Phase C: scope-disjointness + the parallel scheduler (only run workers that
// can't collide, respect deps + concurrency).
//   npx tsx scripts/test-job-parallel.mts
import { scopesDisjoint } from "../src/lib/jobs/scope.js";
import { nextLaunchable, type SchedTask } from "../src/lib/jobs/schedule.js";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { c ? (pass++, console.log("  PASS", l)) : (fail++, console.log("  FAIL", l)); };
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// scopesDisjoint
ok(scopesDisjoint(["app/**"], ["lib/**"]) === true, "disjoint: app/** vs lib/**");
ok(scopesDisjoint(["app/**"], ["app/x.ts"]) === false, "not disjoint: app/** contains app/x.ts");
ok(scopesDisjoint(["lib/a.ts"], ["lib/b.ts"]) === true, "disjoint: different files in same dir");
ok(scopesDisjoint([], ["app/**"]) === false, "not disjoint: empty scope = whole project");
ok(scopesDisjoint(["*.css"], ["app/**"]) === false, "not disjoint: broad root glob");
ok(scopesDisjoint(["app/(app)/**"], ["components/**"]) === true, "disjoint: different top dirs");

// nextLaunchable
{
  const tasks: SchedTask[] = [{ scope: ["a/**"] }, { scope: ["b/**"] }, { scope: ["c/**"] }, { scope: ["d/**"] }];
  ok(eq(nextLaunchable(tasks, new Set(), new Set(), 3), [0, 1, 2]), "launches up to the cap (3) of disjoint tasks");
  ok(eq(nextLaunchable(tasks, new Set([0, 1]), new Set([2]), 3), [3]), "respects done + running");
}
{
  const tasks: SchedTask[] = [{ scope: ["a/**"] }, { scope: ["b/**"], dependsOn: [0] }];
  ok(eq(nextLaunchable(tasks, new Set(), new Set(), 3), [0]), "blocks a task whose dep isn't done");
  ok(eq(nextLaunchable(tasks, new Set([0]), new Set(), 3), [1]), "unblocks once the dep is done");
}
{
  const tasks: SchedTask[] = [{ scope: ["app/**"] }, { scope: ["app/x.ts"] }];
  ok(eq(nextLaunchable(tasks, new Set(), new Set(), 3), [0]), "won't co-launch conflicting scopes");
  ok(eq(nextLaunchable(tasks, new Set([0]), new Set(), 3), [1]), "runs the conflicting one after");
}
{
  const tasks: SchedTask[] = [{ scope: [] }, { scope: ["a/**"] }];
  ok(eq(nextLaunchable(tasks, new Set(), new Set(), 3), [0]), "empty (whole-project) scope runs alone");
}

console.log(`\n=== job parallel: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
