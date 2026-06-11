/* Skill & capability catalogs surfaced on the Skills screen.
 *
 * Two sources ship with Helix:
 *  - "helix": the 24 MIT-licensed engineering skills bundled in the repo's skills/ dir
 *  - "ecc":   the Everything Claude Code (ECC) plugin — skills, subagents, commands,
 *             and rules installable via its marketplace manifest (.claude-plugin/)
 */

export type SkillSource = "helix" | "ecc";
export type SkillKind = "skill" | "agent" | "command" | "rule";

export interface CatalogEntry {
  id: string;
  code: string;
  name: string;
  description: string;
  tag: string;
  group: string;
  source: SkillSource;
  kind: SkillKind;
}

function entry(
  source: SkillSource,
  kind: SkillKind,
  group: string,
  code: string,
  name: string,
  description: string,
  tag: string
): CatalogEntry {
  return { id: `${source}:${name}`, code, name, description, tag, group, source, kind };
}

const h = (group: string, code: string, name: string, description: string, tag: string) =>
  entry("helix", "skill", group, code, name, description, tag);

export const HELIX_SKILLS: CatalogEntry[] = [
  // Plan & Spec
  h("Plan & Spec", "PL", "planning-and-task-breakdown", "Breaks work into ordered, dependency-aware tasks.", "plan"),
  h("Plan & Spec", "SP", "spec-driven-development", "Creates a spec before any code is written.", "plan"),
  h("Plan & Spec", "SD", "source-driven-development", "Grounds every decision in official documentation.", "plan"),
  h("Plan & Spec", "DD", "doubt-driven-development", "Adversarially reviews each non-trivial decision.", "plan"),
  h("Plan & Spec", "CE", "context-engineering", "Optimizes what context the agent loads and when.", "plan"),
  h("Plan & Spec", "ID", "idea-refine", "Refines raw ideas via divergent then convergent thinking.", "plan"),
  h("Plan & Spec", "IN", "interview-me", "Draws out what you actually want before building.", "plan"),
  h("Plan & Spec", "US", "using-agent-skills", "Discovers and invokes the right skill for a task.", "meta"),
  // Build & Ship
  h("Build & Ship", "FE", "frontend-ui-engineering", "Builds production-quality UIs, not AI-aesthetic ones.", "build"),
  h("Build & Ship", "II", "incremental-implementation", "Delivers changes in small, verifiable increments.", "build"),
  h("Build & Ship", "AP", "api-and-interface-design", "Designs stable APIs and module boundaries.", "build"),
  h("Build & Ship", "SH", "shipping-and-launch", "Prepares safe production launches.", "ship"),
  h("Build & Ship", "CI", "ci-cd-and-automation", "Automates build, test, and deploy pipelines.", "ship"),
  // Quality & Safety
  h("Quality & Safety", "CR", "code-review-and-quality", "Multi-axis review for correctness and clarity.", "quality"),
  h("Quality & Safety", "TD", "test-driven-development", "Drives implementation from failing tests.", "quality"),
  h("Quality & Safety", "SE", "security-and-hardening", "Hardens code against common vulnerabilities.", "security"),
  h("Quality & Safety", "PE", "performance-optimization", "Finds and fixes real performance bottlenecks.", "perf"),
  h("Quality & Safety", "DB", "debugging-and-error-recovery", "Systematic root-cause debugging, not guessing.", "debug"),
  h("Quality & Safety", "BT", "browser-testing-with-devtools", "Tests in real browsers via Chrome DevTools.", "test"),
  // Maintain
  h("Maintain", "CS", "code-simplification", "Simplifies code for clarity and maintainability.", "maintain"),
  h("Maintain", "DM", "deprecation-and-migration", "Plans and executes safe migrations.", "maintain"),
  h("Maintain", "DO", "documentation-and-adrs", "Records decisions and keeps docs current.", "docs"),
  h("Maintain", "GI", "git-workflow-and-versioning", "Structures branching, commits, and releases.", "git"),
  h("Maintain", "OB", "observability-and-instrumentation", "Instruments code so prod behavior is visible.", "ops"),
];

const es = (group: string, name: string, description: string, tag = "skill") =>
  entry("ecc", "skill", group, name.slice(0, 2).toUpperCase(), name, description, tag);
const ea = (name: string, description: string) =>
  entry("ecc", "agent", "Subagents", name.slice(0, 2).toUpperCase(), name, description, "agent");
const ec = (name: string, description: string) =>
  entry("ecc", "command", "Commands", name.replace("/", "").slice(0, 2).toUpperCase(), name, description, "command");
const er = (name: string, description: string) =>
  entry("ecc", "rule", "Rules", name.slice(0, 2).toUpperCase(), name, description, "rule");

export const ECC_CATALOG: CatalogEntry[] = [
  // --- Core workflow skills
  es("Core Workflows", "coding-standards", "Language best practices across the stack."),
  es("Core Workflows", "backend-patterns", "API, database, and caching patterns."),
  es("Core Workflows", "frontend-patterns", "React and Next.js patterns."),
  es("Core Workflows", "api-design", "REST API design, pagination, error responses."),
  es("Core Workflows", "database-migrations", "Migration patterns: Prisma, Drizzle, Django, Go."),
  es("Core Workflows", "deployment-patterns", "CI/CD, Docker, health checks, rollbacks."),
  es("Core Workflows", "docker-patterns", "Compose, networking, volumes, container security."),
  es("Core Workflows", "postgres-patterns", "PostgreSQL optimization patterns."),
  es("Core Workflows", "search-first", "Research-before-coding workflow."),
  es("Core Workflows", "tdd-workflow", "TDD methodology.", "test"),
  es("Core Workflows", "e2e-testing", "Playwright E2E patterns and Page Object Model.", "test"),
  es("Core Workflows", "security-review", "Security checklist.", "security"),
  es("Core Workflows", "security-scan", "AgentShield security auditor integration.", "security"),
  es("Core Workflows", "eval-harness", "Verification loop evaluation.", "verify"),
  es("Core Workflows", "verification-loop", "Continuous verification.", "verify"),
  es("Core Workflows", "iterative-retrieval", "Progressive context refinement for subagents."),
  es("Core Workflows", "strategic-compact", "Manual compaction suggestions."),
  es("Core Workflows", "continuous-learning", "Stop-hook pattern extraction (v1)."),
  es("Core Workflows", "continuous-learning-v2", "Instinct-based learning with confidence scoring."),
  es("Core Workflows", "autonomous-loops", "Sequential pipelines, PR loops, DAG orchestration."),
  es("Core Workflows", "configure-ecc", "Interactive installation wizard."),
  es("Core Workflows", "skill-stocktake", "Audit skills and commands for quality."),
  es("Core Workflows", "plankton-code-quality", "Write-time code quality enforcement with hooks."),
  es("Core Workflows", "codehealth-mcp", "Optional CodeScene Code Health MCP (opt-in)."),
  // --- Language & framework skills
  es("Languages & Frameworks", "python-patterns", "Python idioms and best practices.", "python"),
  es("Languages & Frameworks", "python-testing", "Python testing with pytest.", "python"),
  es("Languages & Frameworks", "golang-patterns", "Go idioms and best practices.", "go"),
  es("Languages & Frameworks", "golang-testing", "Go testing patterns, TDD, benchmarks.", "go"),
  es("Languages & Frameworks", "cpp-coding-standards", "C++ Core Guidelines standards.", "cpp"),
  es("Languages & Frameworks", "cpp-testing", "GoogleTest, CMake/CTest workflows.", "cpp"),
  es("Languages & Frameworks", "java-coding-standards", "Java coding standards.", "java"),
  es("Languages & Frameworks", "jpa-patterns", "JPA/Hibernate patterns.", "java"),
  es("Languages & Frameworks", "springboot-patterns", "Spring Boot patterns.", "java"),
  es("Languages & Frameworks", "springboot-security", "Spring Boot security.", "java"),
  es("Languages & Frameworks", "springboot-tdd", "Spring Boot TDD.", "java"),
  es("Languages & Frameworks", "springboot-verification", "Spring Boot verification.", "java"),
  es("Languages & Frameworks", "quarkus-patterns", "Java Quarkus patterns.", "java"),
  es("Languages & Frameworks", "quarkus-security", "Quarkus security.", "java"),
  es("Languages & Frameworks", "quarkus-tdd", "Quarkus TDD.", "java"),
  es("Languages & Frameworks", "quarkus-verification", "Quarkus verification.", "java"),
  es("Languages & Frameworks", "django-patterns", "Django patterns, models, views.", "python"),
  es("Languages & Frameworks", "django-security", "Django security best practices.", "python"),
  es("Languages & Frameworks", "django-tdd", "Django TDD workflow.", "python"),
  es("Languages & Frameworks", "django-verification", "Django verification loops.", "python"),
  es("Languages & Frameworks", "laravel-patterns", "Laravel architecture patterns.", "php"),
  es("Languages & Frameworks", "laravel-security", "Laravel security best practices.", "php"),
  es("Languages & Frameworks", "laravel-tdd", "Laravel TDD workflow.", "php"),
  es("Languages & Frameworks", "laravel-verification", "Laravel verification loops.", "php"),
  es("Languages & Frameworks", "perl-patterns", "Modern Perl 5.36+ idioms.", "perl"),
  es("Languages & Frameworks", "perl-security", "Perl taint mode, safe I/O.", "perl"),
  es("Languages & Frameworks", "perl-testing", "Perl TDD with Test2::V0, prove.", "perl"),
  es("Languages & Frameworks", "swift-actor-persistence", "Thread-safe Swift persistence with actors.", "swift"),
  es("Languages & Frameworks", "swift-protocol-di-testing", "Protocol-based DI for testable Swift.", "swift"),
  es("Languages & Frameworks", "swift-concurrency-6-2", "Swift 6.2 Approachable Concurrency.", "swift"),
  es("Languages & Frameworks", "liquid-glass-design", "iOS 26 Liquid Glass design system.", "swift"),
  es("Languages & Frameworks", "foundation-models-on-device", "Apple on-device LLM with FoundationModels.", "swift"),
  // --- Data, AI & content skills
  es("Data, AI & Content", "clickhouse-io", "ClickHouse analytics, queries, data engineering.", "data"),
  es("Data, AI & Content", "mle-workflow", "ML data contracts, evals, deployment, monitoring.", "ml"),
  es("Data, AI & Content", "cost-aware-llm-pipeline", "LLM cost optimization, model routing, budgets.", "ml"),
  es("Data, AI & Content", "regex-vs-llm-structured-text", "Decision framework: regex vs LLM parsing.", "ml"),
  es("Data, AI & Content", "content-hash-cache-pattern", "SHA-256 content-hash caching for files.", "perf"),
  es("Data, AI & Content", "videodb", "Video/audio ingest, search, edit, generate, stream.", "media"),
  es("Data, AI & Content", "nutrient-document-processing", "Document processing with Nutrient API.", "docs"),
  es("Data, AI & Content", "frontend-slides", "HTML slide decks and PPTX-to-web workflows.", "content"),
  es("Data, AI & Content", "article-writing", "Long-form writing in a supplied voice.", "content"),
  es("Data, AI & Content", "content-engine", "Multi-platform social content workflows.", "content"),
  es("Data, AI & Content", "market-research", "Source-attributed market and competitor research.", "research"),
  es("Data, AI & Content", "investor-materials", "Pitch decks, one-pagers, memos, models.", "biz"),
  es("Data, AI & Content", "investor-outreach", "Personalized fundraising outreach.", "biz"),
  // --- Subagents (selection of the 64 ECC delegation agents)
  ea("planner", "Feature implementation planning."),
  ea("architect", "System design decisions."),
  ea("tdd-guide", "Test-driven development."),
  ea("code-reviewer", "Quality and security review."),
  ea("security-reviewer", "Vulnerability analysis."),
  ea("build-error-resolver", "Build error diagnosis and fixes."),
  ea("e2e-runner", "Playwright E2E testing."),
  ea("refactor-cleaner", "Dead code cleanup."),
  ea("doc-updater", "Documentation sync."),
  ea("docs-lookup", "Documentation/API lookup."),
  ea("chief-of-staff", "Communication triage and drafts."),
  ea("loop-operator", "Autonomous loop execution."),
  ea("harness-optimizer", "Harness config tuning."),
  ea("typescript-reviewer", "TypeScript/JavaScript code review."),
  ea("python-reviewer", "Python code review."),
  ea("go-reviewer", "Go code review."),
  ea("go-build-resolver", "Go build error resolution."),
  ea("rust-reviewer", "Rust code review."),
  ea("rust-build-resolver", "Rust build error resolution."),
  ea("cpp-reviewer", "C++ code review."),
  ea("cpp-build-resolver", "C++ build error resolution."),
  ea("java-reviewer", "Java/Spring Boot code review."),
  ea("java-build-resolver", "Java/Maven/Gradle build errors."),
  ea("kotlin-reviewer", "Kotlin/Android/KMP code review."),
  ea("kotlin-build-resolver", "Kotlin/Gradle build errors."),
  ea("fsharp-reviewer", "F# functional code review."),
  ea("database-reviewer", "Database/Supabase review."),
  ea("harmonyos-app-resolver", "HarmonyOS/ArkTS app development."),
  ea("pytorch-build-resolver", "PyTorch/CUDA training errors."),
  ea("mle-reviewer", "Production ML pipeline, eval, serving review."),
  // --- Slash commands
  ec("/plan", "Implementation planning."),
  ec("/code-review", "Quality review."),
  ec("/build-fix", "Fix build errors."),
  ec("/refactor-clean", "Dead code removal."),
  ec("/quality-gate", "Verification gate."),
  ec("/learn", "Extract patterns mid-session."),
  ec("/learn-eval", "Extract, evaluate, and save patterns."),
  ec("/checkpoint", "Save verification state."),
  ec("/setup-pm", "Configure package manager."),
  ec("/go-review", "Go code review."),
  ec("/go-test", "Go TDD workflow."),
  ec("/go-build", "Fix Go build errors."),
  ec("/skill-create", "Generate skills from git history."),
  ec("/instinct-status", "View learned instincts."),
  ec("/instinct-import", "Import instincts."),
  ec("/instinct-export", "Export instincts."),
  ec("/evolve", "Cluster instincts into skills."),
  ec("/prune", "Delete expired pending instincts."),
  ec("/pm2", "PM2 service lifecycle management."),
  ec("/multi-plan", "Multi-agent task decomposition."),
  ec("/multi-execute", "Orchestrated multi-agent workflows."),
  ec("/multi-backend", "Backend multi-service orchestration."),
  ec("/multi-frontend", "Frontend multi-service orchestration."),
  ec("/multi-workflow", "General multi-service workflows."),
  ec("/sessions", "Session history management."),
  ec("/test-coverage", "Test coverage analysis."),
  ec("/update-docs", "Update documentation."),
  ec("/update-codemaps", "Update codemaps."),
  ec("/python-review", "Python code review."),
  // --- Always-follow rules
  er("coding-style", "Immutability, file organization."),
  er("git-workflow", "Commit format, PR process."),
  er("testing", "TDD, 80% coverage requirement."),
  er("performance", "Model selection, context management."),
  er("patterns", "Design patterns, skeleton projects."),
  er("hooks", "Hook architecture, TodoWrite."),
  er("agents", "When to delegate to subagents."),
  er("security", "Mandatory security checks."),
];

export const ALL_ENTRIES: CatalogEntry[] = [...HELIX_SKILLS, ...ECC_CATALOG];

export const SOURCE_LABELS: Record<SkillSource, string> = {
  helix: "Helix bundled",
  ecc: "Everything Claude Code",
};
