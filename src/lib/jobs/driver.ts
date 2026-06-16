import "server-only";

/**
 * Job driver — enqueues a job and triggers the next slice across invocations.
 *
 * Drivers, in order of preference:
 *  1. Upstash QStash (if QSTASH_TOKEN set) — reliable at-least-once delivery +
 *     retries; the production driver. Targets the trusted public origin.
 *  2. after()-chaining self-invoke — works with no extra service: each slice
 *     fires the next via an HTTP call to our own /api/jobs/[id]/step.
 *  3. The cron backstop (/api/cron/jobs) rescues any chain that drops.
 *
 * Auth: the step route requires `Authorization: Bearer <JOBS_SECRET||AUTH_SECRET>`.
 */

import { after } from "next/server";
import { appOrigin } from "@/lib/app-url";
import { createJob } from "./store";
import type { JobState, JobStep } from "./types";

/** Leave margin under the 300s function ceiling for checkpoint + trigger. */
export const SLICE_DEADLINE_MS = 250_000;

export function jobsSecret(): string {
  return process.env.JOBS_SECRET || process.env.AUTH_SECRET || "helix-jobs-dev-secret";
}

/**
 * Schedule the next slice. In production we target the trusted origin (never a
 * request header — no host-header injection of our secret); in dev we may use
 * the caller's localhost origin so self-invoke actually reaches the dev server.
 */
export function triggerNext(id: string, devOrigin?: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const origin = (!isProd && devOrigin) || appOrigin();
  const url = `${origin}/api/jobs/${id}/step`;
  const secret = jobsSecret();
  const qstash = process.env.QSTASH_TOKEN;

  after(async () => {
    try {
      if (qstash && isProd) {
        // QStash forwards Upstash-Forward-* headers to the destination.
        await fetch(`https://qstash.upstash.io/v2/publish/${url}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${qstash}`,
            "Upstash-Forward-Authorization": `Bearer ${secret}`,
          },
        });
      } else {
        await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      }
    } catch (e) {
      console.error("[jobs] triggerNext failed (cron backstop will retry):", e);
    }
  });
}

/** Create a durable job and kick off its first slice. Returns the task id. */
export async function enqueueJob(opts: {
  workspaceId: string;
  userId: string;
  prompt: string;
  kind: string;
  steps: JobStep[];
  intentId?: string | null;
  devOrigin?: string;
}): Promise<string> {
  const state: JobState = {
    kind: opts.kind,
    userId: opts.userId,
    steps: opts.steps,
    cursor: 0,
    results: [],
    written: [],
    deleted: [],
    attempts: 0,
    intentId: opts.intentId ?? null,
  };
  const id = await createJob(opts.workspaceId, opts.prompt, state);
  triggerNext(id, opts.devOrigin);
  return id;
}
