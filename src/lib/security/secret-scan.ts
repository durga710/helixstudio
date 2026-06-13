import "server-only";

/**
 * Secret scanner — catches hardcoded credentials in files BEFORE they're pushed
 * to git or deployed. Two signals, like gitleaks/truffleHog, no dependencies:
 *
 *   1. PATTERNS — known key shapes (AWS, GitHub, OpenAI, Stripe, JWT, private
 *      keys, generic `api_key = "..."` assignments).
 *   2. ENTROPY — Shannon entropy flags generic high-randomness strings that
 *      don't match a known pattern (the long base64/hex secrets), while skipping
 *      hashes, hex ids, and obvious non-secrets to keep noise down.
 *
 * Findings are warnings (the value is redacted), surfaced to the user — never a
 * silent block.
 */

export interface SecretFinding {
  path: string;
  line: number;
  rule: string;
  /** A redacted preview — never the full secret. */
  preview: string;
}

const PATTERNS: [string, RegExp][] = [
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[posru]_[0-9A-Za-z]{36,}\b/],
  ["GitHub fine-grained PAT", /\bgithub_pat_[0-9A-Za-z_]{22,}\b/],
  ["OpenAI / Anthropic key", /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Stripe secret key", /\bsk_(live|test)_[0-9A-Za-z]{16,}\b/],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["Hardcoded credential", /(?:api[_-]?key|secret|token|passwd|password|access[_-]?key)["'\s]*[:=]\s*["'][^"']{12,}["']/i],
];

/** Shannon entropy in bits per character. */
function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let e = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

const ENTROPY_MIN_LEN = 20;
const ENTROPY_THRESHOLD = 4.0; // bits/char — base64 secrets sit ~4.5-6, words ~3

/** Hex hashes / commit shas / numeric ids look random but aren't secrets. */
function looksBenign(t: string): boolean {
  if (/^[0-9a-f]{32,64}$/i.test(t)) return true; // md5/sha hashes, git shas
  if (/^[0-9]+$/.test(t)) return true; // long numbers
  if (/^(data|https?|blob):/i.test(t)) return true; // urls / data uris
  // Very long base64 is asset data (inline images, encoded blobs), not a secret —
  // real keys are far shorter. (A private key block is still caught by PATTERNS.)
  if (t.length >= 200 && /^[A-Za-z0-9+/=]+$/.test(t)) return true;
  return false;
}

function redact(s: string): string {
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`;
}

/** Scan one file's content for likely secrets. */
export function scanContent(path: string, content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  const push = (line: number, rule: string, value: string) => {
    const key = `${line}:${rule}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ path, line, rule, preview: redact(value) });
  };

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 600) continue; // skip minified / lockfile lines (noise)

    for (const [rule, re] of PATTERNS) {
      const m = re.exec(line);
      if (m) push(i + 1, rule, m[0]);
    }

    // Entropy pass — long opaque tokens that didn't match a known pattern.
    const tokens = line.match(/[A-Za-z0-9+/=_-]{20,}/g) ?? [];
    for (const t of tokens) {
      if (t.length >= ENTROPY_MIN_LEN && !looksBenign(t) && shannonEntropy(t) >= ENTROPY_THRESHOLD) {
        push(i + 1, "high-entropy string", t);
        break; // one entropy hit per line is plenty
      }
    }
  }
  return findings;
}

/** Scan a set of files; capped so a huge push can't stall. */
export function scanFiles(files: { path: string; content: string }[], cap = 200): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const f of files) {
    // Skip lockfiles / vendored / obvious non-source where hashes abound, and
    // .env.example (placeholder values are meant to be committed).
    if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|(^|\/)\.env\.example$|\.min\.(js|css)$)/.test(f.path)) continue;
    for (const finding of scanContent(f.path, f.content)) {
      out.push(finding);
      if (out.length >= cap) return out;
    }
  }
  return out;
}
