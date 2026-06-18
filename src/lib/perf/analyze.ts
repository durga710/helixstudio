import "server-only";

/**
 * Performance Auditor — the real work behind the pipeline's "Performance
 * Auditor" agent. Measures the ACTUAL shipped weight of the files a build wrote
 * (0-token, deterministic) and flags concrete weight problems. This replaces
 * the hardcoded "142 kB → 98 kB" marketing string with a true measurement of
 * the project's bundle.
 */

export type PerfSeverity = "high" | "medium" | "low";

export interface PerfFinding {
  path: string;
  severity: PerfSeverity;
  detail: string;
}

export interface PerfResult {
  /** Total shipped source bytes (excludes node_modules, lockfiles). */
  totalBytes: number;
  jsBytes: number;
  cssBytes: number;
  htmlBytes: number;
  imageBytes: number;
  fileCount: number;
  findings: PerfFinding[];
  /** One-line summary in the demo's voice ("Bundle 142 kB · JS 98 kB"). */
  summary: string;
}

const LARGE_FILE = 100 * 1024; // 100 kB — a single oversized asset/module
const HEAVY_JS = 500 * 1024; // 500 kB — total JS that will hurt load time
const BIG_INLINE_IMG = 50 * 1024; // 50 kB — a base64 image inlined into source

function byteLen(s: string): number {
  // Approximate UTF-8 size without allocating a Buffer for every file.
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++; // surrogate pair
    } else bytes += 3;
  }
  return bytes;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isCounted(path: string): boolean {
  if (/node_modules\//.test(path)) return false;
  if (/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)/.test(path)) return false;
  return true;
}

const RX = {
  js: /\.(jsx?|tsx?|mjs|cjs)$/i,
  css: /\.(css|scss|sass|less)$/i,
  html: /\.html?$/i,
  img: /\.(png|jpe?g|gif|webp|svg|avif)$/i,
};

/**
 * Measure a set of files (typically the ones a build just wrote). Reports real
 * sizes and flags genuine weight problems — large single files, heavy total JS,
 * and oversized base64 images inlined into source.
 */
export function analyzePerf(files: { path: string; content: string }[]): PerfResult {
  let totalBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let htmlBytes = 0;
  let imageBytes = 0;
  let fileCount = 0;
  const findings: PerfFinding[] = [];

  for (const f of files) {
    if (!isCounted(f.path)) continue;
    fileCount++;
    const size = byteLen(f.content);
    totalBytes += size;

    if (RX.js.test(f.path)) jsBytes += size;
    else if (RX.css.test(f.path)) cssBytes += size;
    else if (RX.html.test(f.path)) htmlBytes += size;
    else if (RX.img.test(f.path)) imageBytes += size;

    if (size >= LARGE_FILE) {
      findings.push({
        path: f.path,
        severity: size >= LARGE_FILE * 3 ? "high" : "medium",
        detail: `${formatBytes(size)} — large enough to slow first load. Consider splitting or lazy-loading it.`,
      });
    }

    // Oversized base64 data URI inlined into source (common bloat source).
    const inline = /data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)/i.exec(f.content);
    if (inline && inline[1].length >= BIG_INLINE_IMG) {
      findings.push({
        path: f.path,
        severity: "medium",
        detail: `Inlines a ${formatBytes(Math.floor((inline[1].length * 3) / 4))} base64 image — serve it as a real file instead.`,
      });
    }
  }

  if (jsBytes >= HEAVY_JS) {
    findings.push({
      path: "(bundle)",
      severity: "medium",
      detail: `${formatBytes(jsBytes)} of JavaScript — code-split or defer non-critical scripts to improve load time.`,
    });
  }

  const rank: Record<PerfSeverity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const parts = [`JS ${formatBytes(jsBytes)}`];
  if (cssBytes) parts.push(`CSS ${formatBytes(cssBytes)}`);
  const summary = `Bundle ${formatBytes(totalBytes)} · ${parts.join(" · ")}`;

  return { totalBytes, jsBytes, cssBytes, htmlBytes, imageBytes, fileCount, findings, summary };
}
