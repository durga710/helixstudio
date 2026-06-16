// Verifies the durable job slice runner: advances steps, checkpoints, stops at
// the deadline (resumable), and handles done/error/cancel.
//   npx tsx scripts/test-job-runner.mts
import { runSlice, type SliceDeps } from "../src/lib/jobs/runner-core.js";
import type { JobState } from "../src/lib/jobs/types.js";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { c ? (pass++, console.log("  PASS", l)) : (fail++, console.log("  FAIL", l)); };

const base = (n: number): JobState => ({
  kind: "test", userId: "u1", cursor: 0, results: [], written: [], deleted: [], attempts: 0,
  steps: Array.from({ length: n }, (_, i) => ({ kind: "agentTurn" as const, message: `step ${i}` })),
});

// 1. Runs all steps to done, checkpointing each, accumulating changes.
{
  const checkpoints: number[] = [];
  const deps: SliceDeps = {
    deadline: Date.now() + 10_000,
    execute: async (_s, i) => ({ ok: true, summary: `did ${i}`, written: [`f${i}.ts`] }),
    onCheckpoint: async (s) => { checkpoints.push(s.cursor); },
  };
  const out = await runSlice(base(3), deps);
  ok(out.status === "done", "3 steps → done");
  ok(out.state.cursor === 3, "cursor advanced to 3");
  ok(out.state.written.length === 3, "accumulated 3 written files");
  ok(checkpoints.length === 3 && checkpoints[2] === 3, "checkpointed after each step");
  ok(out.state.results.every((r) => r.ok), "all results ok");
}

// 2. Stops at the deadline mid-way → stays "running", resumable from cursor.
{
  let t = 1000;
  const deps: SliceDeps = {
    deadline: 1500, // only the first step fits
    now: () => t,
    execute: async () => { t += 400; return { ok: true }; }, // each step advances clock past deadline
    onCheckpoint: async () => {},
  };
  const out = await runSlice(base(5), deps);
  ok(out.status === "running", "deadline hit → running (not done)");
  ok(out.state.cursor >= 1 && out.state.cursor < 5, "partial progress saved for resume");
}

// 3. A failed step ends the job as error.
{
  const deps: SliceDeps = {
    deadline: Date.now() + 10_000,
    execute: async (_s, i) => (i === 1 ? { ok: false, error: "boom" } : { ok: true }),
    onCheckpoint: async () => {},
  };
  const out = await runSlice(base(3), deps);
  ok(out.status === "error", "failed step → error");
  ok(out.state.cursor === 2, "stops at the failed step");
}

// 4. Cancellation is honored before a step.
{
  const deps: SliceDeps = {
    deadline: Date.now() + 10_000,
    execute: async () => ({ ok: true }),
    onCheckpoint: async () => {},
    isCanceled: async () => true,
  };
  const out = await runSlice(base(3), deps);
  ok(out.status === "canceled", "canceled → canceled, no steps run");
  ok(out.state.cursor === 0, "no progress when canceled up front");
}

console.log(`\n=== job runner: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
