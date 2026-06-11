import type { AnalysisReport, AnalysisRisk, DependencyInfo, SourceFile } from "@/lib/types";

/* Real static analysis (Phase 2) — computed from a repository's actual files. */

const KEY_DEPS = [
  "next", "react", "vue", "svelte", "express", "fastify", "hono", "koa",
  "@prisma/client", "prisma", "drizzle-orm", "mongoose", "pg", "mysql2", "sqlite3",
  "next-auth", "passport", "@auth/core", "jsonwebtoken",
  "tailwindcss", "zod", "typescript", "vitest", "jest",
];

function parsePackageJson(files: SourceFile[]): Record<string, string> {
  const pkg = files.find((f) => f.path === "package.json");
  if (!pkg) return {};
  try {
    const parsed = JSON.parse(pkg.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return { ...(parsed.devDependencies ?? {}), ...(parsed.dependencies ?? {}) };
  } catch {
    return {};
  }
}

function primaryLanguage(files: SourceFile[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    if (!f.language || ["Markdown", "JSON", "YAML", "Lockfile", "Text", "SVG"].includes(f.language)) continue;
    counts.set(f.language, (counts.get(f.language) ?? 0) + 1);
  }
  let best = "Text";
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  if (best === "TSX") best = "TypeScript";
  if (best === "JSX") best = "JavaScript";
  return best;
}

function readmeSummary(files: SourceFile[]): string | null {
  const readme = files.find((f) => /^readme\.(md|mdx|txt)$/i.test(f.path));
  if (!readme) return null;
  const line = readme.content
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>\[\]]/g, "").trim())
    .find((l) => l.length > 12);
  if (!line) return null;
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

export function analyzeRepo(projectId: string, repoName: string, files: SourceFile[]): AnalysisReport {
  const started = Date.now();
  const deps = parsePackageJson(files);
  const lang = primaryLanguage(files);

  const framework = deps.next
    ? "Next.js App Router"
    : deps.react
      ? "React SPA"
      : deps.vue
        ? "Vue"
        : deps.express || deps.fastify || deps.hono
          ? "Node API service"
          : files.some((f) => f.path.endsWith(".py"))
            ? "Python project"
            : `${lang} project`;

  const database = deps["@prisma/client"] || deps.prisma
    ? "PostgreSQL via Prisma"
    : deps["drizzle-orm"]
      ? "Drizzle ORM"
      : deps.mongoose
        ? "MongoDB via Mongoose"
        : deps.pg
          ? "PostgreSQL"
          : "None detected";

  const auth = deps["next-auth"] || deps["@auth/core"]
    ? "Auth.js"
    : deps.passport
      ? "Passport"
      : deps.jsonwebtoken
        ? "JWT (manual)"
        : "None detected";

  const entryCandidates = [
    "src/app/layout.tsx", "app/layout.tsx", "src/index.ts", "src/index.js", "src/main.ts",
    "index.js", "index.ts", "main.py", "app.py", "cmd/main.go", "main.go",
  ].filter((p) => files.some((f) => f.path === p));

  const dependencies: DependencyInfo[] = KEY_DEPS.filter((d) => deps[d])
    .slice(0, 6)
    .map((name) => ({
      name,
      version: deps[name]!.replace(/^[\^~>=]+/, ""),
      status: /-(alpha|beta|rc|canary|next|dev)/.test(deps[name]!) ? "warn" : "ok",
    }));

  const risks: AnalysisRisk[] = [];
  for (const dep of dependencies.filter((d) => d.status === "warn")) {
    risks.push({
      id: `pre-${dep.name}`,
      title: "Pre-release dependency",
      detail: `${dep.name}@${dep.version} is a pre-release build. Track for breaking changes before relying on it in production.`,
      severity: "medium",
      kind: "dependency",
    });
  }
  const envFile = files.find((f) => /^\.env(?!\.example)/.test(f.path.split("/").pop() ?? ""));
  if (envFile) {
    risks.push({
      id: "env-committed",
      title: "Environment file committed",
      detail: `${envFile.path} is checked into the repository — secrets in version control are readable by anyone with repo access.`,
      severity: "high",
      kind: "security",
    });
  }
  const hasTests = files.some((f) => /(^|\/)(__tests__|tests?)\//.test(f.path) || /\.(test|spec)\.[jt]sx?$/.test(f.path));
  if (!hasTests) {
    risks.push({
      id: "no-tests",
      title: "No test coverage detected",
      detail: "No test files or test directories found — regressions will reach production unreviewed.",
      severity: "medium",
      kind: "performance",
    });
  }
  const todoCount = files.reduce((n, f) => n + (f.content.match(/\b(TODO|FIXME|HACK)\b/g)?.length ?? 0), 0);
  if (todoCount > 5) {
    risks.push({
      id: "todos",
      title: `${todoCount} TODO / FIXME markers`,
      detail: "A high count of deferred work markers often hides unfinished error handling or known bugs.",
      severity: "low",
      kind: "dependency",
    });
  }

  const dataFlow = deps.next
    ? ["Web client", "Route handlers", "Business logic", database === "None detected" ? "External APIs" : database.split(" ")[0]!]
    : ["Client", "API", "Logic", "Storage"];

  return {
    projectId,
    scanSeconds: Math.max(0.1, (Date.now() - started) / 1000),
    files: files.length,
    lastCommit: new Date().toISOString(),
    overview: [
      { k: "Purpose", v: readmeSummary(files) ?? `${repoName} — ${framework}` },
      { k: "Architecture", v: framework },
      { k: "Database", v: database },
      { k: "Auth", v: auth },
      { k: "Entry points", v: entryCandidates.slice(0, 2).join(" · ") || "Not detected" },
    ],
    dataFlow,
    dependencies: dependencies.length > 0 ? dependencies : [{ name: "no package.json", version: "—", status: "ok" }],
    risks,
  };
}
