import "server-only";

/**
 * Deploy preflight — the real "Build → Test → Security Scan" gate that runs
 * BEFORE a workspace is linked/deployed. Backs the welcome page's Deployments
 * pipeline (which previously showed only static narration) with genuine,
 * Helix-owned checks over the workspace's actual files:
 *
 *   - SECURITY  — secret + SAST + dependency scan (auditFiles). A hardcoded
 *                 secret is a hard block: deploying credentials is never ok.
 *   - TEST      — reports the project's test setup honestly (full test runs
 *                 happen in the build pipeline's verify step / the sandbox).
 *   - WEIGHT    — real bundle/asset measurement (analyzePerf).
 *
 * 0-token and fast (no sandbox), so it can run inline when the deploy dialog
 * opens without slowing the user down.
 */

import type { Workspace } from "@/generated/prisma/client";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { listWorkspaceFiles, readWorkspaceFile } from "@/lib/workspace";
import { auditFiles, type SecurityFinding } from "@/lib/security/audit";
import { analyzePerf } from "@/lib/perf/analyze";

const SCAN_FILE_CAP = 120;
const FILE_READ_CAP = 200_000;

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface PreflightCheck {
  id: "security" | "test" | "weight";
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PreflightReport {
  checks: PreflightCheck[];
  /** True when nothing BLOCKS the deploy (hardcoded secrets are the only block). */
  ok: boolean;
  /** Security findings (for an expandable detail list in the UI). */
  security: SecurityFinding[];
}

function testDetail(treePaths: string[], pkgJson: string | null): { status: CheckStatus; detail: string } {
  const hasTestFiles = treePaths.some(
    (p) =>
      /(^|\/)(__tests__|tests?)\//.test(p) ||
      /\.(test|spec)\.[jt]sx?$/.test(p) ||
      /(^|\/)test_[^/]+\.py$/.test(p) ||
      /_test\.py$/.test(p),
  );
  let hasTestScript = false;
  try {
    const scripts = (JSON.parse(pkgJson ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {};
    hasTestScript = Boolean(scripts.test);
  } catch {
    /* ignore */
  }
  if (hasTestFiles || hasTestScript) {
    return { status: "pass", detail: "Test suite detected — runs in the build/verify step" };
  }
  return { status: "skip", detail: "No tests found — consider adding a test suite" };
}

export async function runPreflight(opts: { ws: Workspace; userId: string }): Promise<PreflightReport> {
  const { ws, userId } = opts;
  const gitAuth = await getGitAuth(userId, ws.provider);
  const tree = await withGitAuth(gitAuth, () => listWorkspaceFiles(ws)).catch(() => [] as { path: string }[]);
  const treePaths = tree.map((f) => f.path);

  const files: { path: string; content: string }[] = [];
  for (const p of treePaths.slice(0, SCAN_FILE_CAP)) {
    const content = await withGitAuth(gitAuth, () => readWorkspaceFile(ws, p)).catch(() => null);
    if (content != null) files.push({ path: p, content: content.slice(0, FILE_READ_CAP) });
  }
  const pkgJson = files.find((f) => f.path === "package.json")?.content ?? null;

  // Security — the gate. A hardcoded secret blocks; other issues warn.
  const audit = auditFiles(files);
  const hasSecret = audit.findings.some((f) => f.rule.startsWith("Hardcoded secret"));
  const securityCheck: PreflightCheck = {
    id: "security",
    label: "Security scan",
    status: hasSecret ? "fail" : audit.clean ? "pass" : "warn",
    detail: hasSecret
      ? "Hardcoded secret detected — remove it before deploying"
      : audit.summary,
  };

  const test = testDetail(treePaths, pkgJson);
  const testCheck: PreflightCheck = { id: "test", label: "Tests", status: test.status, detail: test.detail };

  const perf = analyzePerf(files);
  const heavy = perf.findings.some((f) => f.severity === "high");
  const weightCheck: PreflightCheck = {
    id: "weight",
    label: "Bundle weight",
    status: heavy ? "warn" : "pass",
    detail: perf.summary,
  };

  return {
    checks: [securityCheck, testCheck, weightCheck],
    ok: !hasSecret,
    security: audit.findings.slice(0, 25),
  };
}
