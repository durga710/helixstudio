# Helix Studio Agent Skills

Software-engineering skills bundled with Helix Studio. Sourced from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT — see `LICENSE`).

**24 skills.** Each folder holds a `SKILL.md` the agent loads on demand; some include extra reference files.

| Skill | Folder | What it does |
|---|---|---|
| `api-and-interface-design` | [`api-and-interface-design/`](api-and-interface-design/SKILL.md) | Guides stable API and interface design. Use when designing APIs, module boundaries, or any public interface. Use when creating REST or GraphQL endp… |
| `browser-testing-with-devtools` | [`browser-testing-with-devtools/`](browser-testing-with-devtools/SKILL.md) | Tests in real browsers via Chrome DevTools MCP. Use when building or debugging anything that runs in a browser. Use when you need to inspect the DO… |
| `ci-cd-and-automation` | [`ci-cd-and-automation/`](ci-cd-and-automation/SKILL.md) | Automates CI/CD pipeline setup. Use when setting up or modifying build and deployment pipelines. Use when you need to automate quality gates, confi… |
| `code-review-and-quality` | [`code-review-and-quality/`](code-review-and-quality/SKILL.md) | Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when yo… |
| `code-simplification` | [`code-simplification/`](code-simplification/SKILL.md) | Simplifies code for clarity. Use when refactoring code for clarity without changing behavior. Use when code works but is harder to read, maintain, … |
| `context-engineering` | [`context-engineering/`](context-engineering/SKILL.md) | Optimizes agent context setup. Use when starting a new session, when agent output quality degrades, when switching between tasks, or when you need … |
| `debugging-and-error-recovery` | [`debugging-and-error-recovery/`](debugging-and-error-recovery/SKILL.md) | Guides systematic root-cause debugging. Use when tests fail, builds break, behavior doesn't match expectations, or you encounter any unexpected err… |
| `deprecation-and-migration` | [`deprecation-and-migration/`](deprecation-and-migration/SKILL.md) | Manages deprecation and migration. Use when removing old systems, APIs, or features. Use when migrating users from one implementation to another. U… |
| `documentation-and-adrs` | [`documentation-and-adrs/`](documentation-and-adrs/SKILL.md) | Records decisions and documentation. Use when making architectural decisions, changing public APIs, shipping features, or when you need to record c… |
| `doubt-driven-development` | [`doubt-driven-development/`](doubt-driven-development/SKILL.md) | Subjects every non-trivial decision to a fresh-context adversarial review before it stands. Use when correctness matters more than speed, when work… |
| `frontend-ui-engineering` | [`frontend-ui-engineering/`](frontend-ui-engineering/SKILL.md) | Builds production-quality UIs. Use when building or modifying user-facing interfaces. Use when creating components, implementing layouts, managing … |
| `git-workflow-and-versioning` | [`git-workflow-and-versioning/`](git-workflow-and-versioning/SKILL.md) | Structures git workflow practices. Use when making any code change. Use when committing, branching, resolving conflicts, or when you need to organi… |
| `idea-refine` | [`idea-refine/`](idea-refine/SKILL.md) | Refines raw ideas into sharp, actionable concepts through structured divergent and convergent thinking. Use when an idea is still vague, when you n… |
| `incremental-implementation` | [`incremental-implementation/`](incremental-implementation/SKILL.md) | Delivers changes incrementally. Use when implementing any feature or change that touches more than one file. Use when you're about to write a large… |
| `interview-me` | [`interview-me/`](interview-me/SKILL.md) | Extracts what the user actually wants instead of what they think they should want. Achieves this through one-question-at-a-time interview until ~95… |
| `observability-and-instrumentation` | [`observability-and-instrumentation/`](observability-and-instrumentation/SKILL.md) | Instruments code so production behavior is visible and diagnosable. Use when adding logging, metrics, tracing, or alerting. Use when shipping any f… |
| `performance-optimization` | [`performance-optimization/`](performance-optimization/SKILL.md) | Optimizes application performance. Use when performance requirements exist, when you suspect performance regressions, or when Core Web Vitals or lo… |
| `planning-and-task-breakdown` | [`planning-and-task-breakdown/`](planning-and-task-breakdown/SKILL.md) | Breaks work into ordered tasks. Use when you have a spec or clear requirements and need to break work into implementable tasks. Use when a task fee… |
| `security-and-hardening` | [`security-and-hardening/`](security-and-hardening/SKILL.md) | Hardens code against vulnerabilities. Use when handling user input, authentication, data storage, or external integrations. Use when building any f… |
| `shipping-and-launch` | [`shipping-and-launch/`](shipping-and-launch/SKILL.md) | Prepares production launches. Use when preparing to deploy to production. Use when you need a pre-launch checklist, when setting up monitoring, whe… |
| `source-driven-development` | [`source-driven-development/`](source-driven-development/SKILL.md) | Grounds every implementation decision in official documentation. Use when you want authoritative, source-cited code free from outdated patterns. Us… |
| `spec-driven-development` | [`spec-driven-development/`](spec-driven-development/SKILL.md) | Creates specs before coding. Use when starting a new project, feature, or significant change and no specification exists yet. Use when requirements… |
| `test-driven-development` | [`test-driven-development/`](test-driven-development/SKILL.md) | Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code work… |
| `using-agent-skills` | [`using-agent-skills/`](using-agent-skills/SKILL.md) | Discovers and invokes agent skills. Use when starting a session or when you need to discover which skill applies to the current task. This is the m… |
