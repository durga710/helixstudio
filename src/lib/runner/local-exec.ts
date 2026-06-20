import "server-only";

/**
 * Local command execution — the dev / self-hosted counterpart to
 * execInSandbox(). Exports the workspace to a fresh temp dir and runs one shell
 * command there, mirroring the sandbox's semantics: a disposable copy, nothing
 * the command does flows back to the stored workspace files.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Workspace } from "@/generated/prisma/client";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";

export type ExecResult =
  | { exitCode: number; stdout: string; stderr: string }
  | { error: string };

const EXEC_TIMEOUT_MS = 120_000; // 2 minutes, then SIGKILL — matches the sandbox
const EXEC_OUTPUT_CAP = 8_000; // per stream
const MAX_EXPORT_FILES = 300;

function cap(text: string): string {
  return text.length > EXEC_OUTPUT_CAP ? `${text.slice(0, EXEC_OUTPUT_CAP)}… [truncated]` : text;
}

export async function execLocal(ws: Workspace, command: string): Promise<ExecResult> {
  let dir: string;
  try {
    const files = await listWorkspaceFiles(ws);
    dir = path.join(os.tmpdir(), "helix-exec", ws.id);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const f of files.slice(0, MAX_EXPORT_FILES)) {
      const content = await readWorkspaceFile(ws, f.path);
      if (content === null) continue; // binary/unreadable — skip
      const fp = path.join(dir, f.path);
      await mkdir(path.dirname(fp), { recursive: true });
      await writeFile(fp, content, "utf8");
    }
  } catch (e) {
    return { error: `Couldn't prepare the workspace: ${e instanceof Error ? e.message : "unknown error"}` };
  }

  return await new Promise<ExecResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r: ExecResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    // shell:true uses the platform shell (sh on POSIX, cmd on Windows), so this
    // works wherever Helix's own dev server runs.
    const proc = spawn(command, { cwd: dir, shell: true, env: { ...process.env } });

    const killer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish({
        exitCode: 124,
        stdout: cap(stdout),
        stderr: cap(`${stderr}\n[helix] command timed out after ${EXEC_TIMEOUT_MS / 1000}s`),
      });
    }, EXEC_TIMEOUT_MS);

    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", (e) => {
      clearTimeout(killer);
      finish({ error: `Couldn't run the command: ${e.message}` });
    });
    proc.on("close", (code) => {
      clearTimeout(killer);
      finish({ exitCode: code ?? 0, stdout: cap(stdout), stderr: cap(stderr) });
    });
  });
}
