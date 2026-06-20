import "server-only";

/**
 * Security Auditor — the real work behind the pipeline's "Security Auditor"
 * agent. Runs over the files a build actually wrote (0-token, deterministic):
 *
 *   1. SECRETS  — hardcoded credentials, via the existing secret scanner.
 *   2. SAST     — a focused set of dangerous code patterns (XSS sinks, code/
 *                 command injection, SQL string-building) with low false-positive
 *                 rules. Not a full SAST engine, but genuine static checks — not
 *                 the "no vulnerabilities found" theater the marketing implied.
 *   3. DEPS     — known-risky / deprecated dependencies declared in package.json.
 *
 * Findings are advisory and surfaced to the user — never a silent block.
 */

import { scanFiles, type SecretFinding } from "@/lib/security/secret-scan";

export type Severity = "high" | "medium" | "low";

export interface SecurityFinding {
  path: string;
  line: number;
  rule: string;
  severity: Severity;
  detail: string;
}

export interface SecurityAuditResult {
  findings: SecurityFinding[];
  /** True when nothing of medium+ severity was found. */
  clean: boolean;
  /** A one-line summary in the demo's voice ("No vulnerabilities found" / "2 issues found"). */
  summary: string;
}

/* --------------------------- SAST patterns --------------------------- */
// Each rule is a regex over a single line plus a severity + human detail. Kept
// deliberately tight (anchored to real sinks, requiring interpolation/concat
// where injection is the risk) so the audit stays trustworthy, not noisy.

interface SastRule {
  rule: string;
  severity: Severity;
  detail: string;
  re: RegExp;
  /** Skip the match unless the line ALSO contains dynamic input (interpolation
   * or string concatenation) — the part that makes the sink dangerous. */
  needsDynamic?: boolean;
}

const DYNAMIC = /\$\{|`|\+\s*[a-zA-Z_$]|\)\s*\+/; // template/interp or concat

const SAST_RULES: SastRule[] = [
  {
    rule: "Code injection (eval)",
    severity: "high",
    detail: "eval()/new Function() executes arbitrary code — avoid it, or never pass user input to it.",
    re: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    rule: "XSS sink (dangerouslySetInnerHTML)",
    severity: "high",
    detail: "Rendering raw HTML can inject scripts. Sanitize the value (e.g. DOMPurify) before using it.",
    re: /dangerouslySetInnerHTML/,
    needsDynamic: true,
  },
  {
    rule: "XSS sink (innerHTML)",
    severity: "medium",
    detail: "Assigning built-up strings to innerHTML can inject markup. Use textContent or sanitize.",
    re: /\.innerHTML\s*=/,
    needsDynamic: true,
  },
  {
    rule: "XSS sink (document.write)",
    severity: "medium",
    detail: "document.write with dynamic content can inject scripts. Build DOM nodes instead.",
    re: /document\.write\s*\(/,
    needsDynamic: true,
  },
  {
    rule: "Command injection",
    severity: "high",
    detail: "Building a shell command from variables allows command injection. Use execFile with an args array.",
    re: /\b(exec|execSync|spawnSync)\s*\(/,
    needsDynamic: true,
  },
  {
    rule: "SQL injection",
    severity: "high",
    detail: "Interpolating values into SQL allows injection. Use parameterized queries / placeholders.",
    re: /(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}(FROM|INTO|SET|WHERE)?/i,
    needsDynamic: true,
  },
  {
    rule: "Insecure transport (http://)",
    severity: "low",
    detail: "Fetching over http:// is unencrypted. Prefer https:// for any non-localhost host.",
    re: /["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
  },
];

/** Dependencies that warrant a flag when declared. Small, offline, curated. */
const RISKY_DEPS: Record<string, { severity: Severity; detail: string }> = {
  request: { severity: "low", detail: "`request` is deprecated and unmaintained — migrate to undici/axios/fetch." },
  "left-pad": { severity: "low", detail: "Trivial micro-dependency — use String.prototype.padStart instead." },
  "node-uuid": { severity: "low", detail: "`node-uuid` is deprecated — use the `uuid` package." },
  serialize: { severity: "medium", detail: "Some serialize libs have RCE history — verify the version and source." },
  "event-stream": { severity: "high", detail: "`event-stream` had a supply-chain compromise — audit the version pinned." },
};

function scanLineSast(path: string, lineNo: number, line: string): SecurityFinding[] {
  if (line.length > 600) return []; // skip minified lines
  const out: SecurityFinding[] = [];
  const hasDynamic = DYNAMIC.test(line);
  for (const r of SAST_RULES) {
    if (r.needsDynamic && !hasDynamic) continue;
    if (r.re.test(line)) {
      out.push({ path, line: lineNo, rule: r.rule, severity: r.severity, detail: r.detail });
    }
  }
  return out;
}

function secretToFinding(f: SecretFinding): SecurityFinding {
  return {
    path: f.path,
    line: f.line,
    rule: `Hardcoded secret — ${f.rule}`,
    severity: "high",
    detail: `Looks like a credential committed to source (${f.preview}). Move it to an environment variable.`,
  };
}

function depFindings(files: { path: string; content: string }[]): SecurityFinding[] {
  const pkg = files.find((f) => /(^|\/)package\.json$/.test(f.path));
  if (!pkg) return [];
  let deps: Record<string, string> = {};
  try {
    const parsed = JSON.parse(pkg.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    deps = { ...(parsed.devDependencies ?? {}), ...(parsed.dependencies ?? {}) };
  } catch {
    return [];
  }
  const out: SecurityFinding[] = [];
  for (const [name, meta] of Object.entries(RISKY_DEPS)) {
    if (deps[name]) {
      out.push({ path: pkg.path, line: 1, rule: `Risky dependency — ${name}`, severity: meta.severity, detail: meta.detail });
    }
  }
  return out;
}

/** A file is worth scanning for SAST issues. */
function isScannable(path: string): boolean {
  if (/node_modules\//.test(path)) return false;
  if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$)/.test(path)) return false;
  return /\.(jsx?|tsx?|mjs|cjs|html|vue|svelte|py|php|rb|sql)$/i.test(path);
}

/**
 * Audit a set of files (typically the ones a build just wrote). Synchronous,
 * dependency-free, capped so a large write can't stall the pipeline.
 */
export function auditFiles(files: { path: string; content: string }[]): SecurityAuditResult {
  const findings: SecurityFinding[] = [];

  // 1. Secrets (reuse the battle-tested scanner).
  for (const s of scanFiles(files)) findings.push(secretToFinding(s));

  // 2. SAST over scannable source.
  for (const f of files) {
    if (!isScannable(f.path)) continue;
    const lines = f.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      findings.push(...scanLineSast(f.path, i + 1, lines[i]));
      if (findings.length >= 200) break;
    }
    if (findings.length >= 200) break;
  }

  // 3. Risky dependencies.
  findings.push(...depFindings(files));

  // Dedup (a line can trip multiple passes) and rank by severity.
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    const key = `${f.path}:${f.line}:${f.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  deduped.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const significant = deduped.filter((f) => f.severity !== "low").length;
  const clean = significant === 0;
  const summary = clean
    ? deduped.length === 0
      ? "No vulnerabilities found"
      : `No serious issues — ${deduped.length} low-severity note${deduped.length === 1 ? "" : "s"}`
    : `${significant} issue${significant === 1 ? "" : "s"} to review`;

  return { findings: deduped, clean, summary };
}
