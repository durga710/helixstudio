<p align="center">
  <img src="assets/brand/png/full-lockup-2400.png" alt="Helix Studio" width="520"/>
</p>

<h1 align="center">Helix Studio</h1>

<p align="center">The AI coding platform that plans, builds, and ships with you.<br/>
<a href="https://helixstudio.org">helixstudio.org</a></p>

---

Helix Studio is a full AI software-engineering platform in the class of Cursor, Windsurf, and Claude Code — a real editor, a repository-aware assistant, and a five-agent review pipeline (Architect → Engineer → Reviewer → Security → Performance) in one workspace.

## Repository contents

| Path | What it is |
|---|---|
| `helix-studio-mockup.html` | Interactive product prototype — 7 screens, live theming, working editor/tabs/tree, runnable agent pipeline. The source of truth for UX. |
| `helixstudio-landing.html` | Marketing landing page for helixstudio.org. |
| `helix-login.html` | Sign-in screen (OAuth + email, full lockup). |
| `assets/brand/` | Official **Circuit Core** logo — SVGs, PNG exports, palette (`BRAND.md`). |
| `skills/` | 24 bundled agent skills (MIT, from addyosmani/agent-skills) + index. |
| `CLAUDE.md` | Agent operating manual + coding standards (read automatically by Claude Code). |
| `PRODUCT.md` | Product vision and feature scope. |
| `ARCHITECTURE.md` | System design, services, and agent pipeline. |
| `DESIGN_SYSTEM.md` | Visual language, tokens, components, accessibility. |
| `TASKS.md` | Phased roadmap. |
| `HANDOFF.md` | **Start here if you're Claude Code** — how to build the real app from these specs. |

## Brand

Logo: **Circuit Core** (an H mark in a rounded tile with cyan→blue→violet circuitry).

| Token | Hex |
|---|---|
| Core black | `#070b12` |
| Panel black | `#0d1626` |
| Circuit cyan | `#00ffd1` |
| Electric blue (accent) | `#3b82f6` |
| Violet edge | `#c084fc` |
| Text white | `#f8fbff` |

## Status

Phase 0 (design) is complete: prototype, landing, login, brand, specs, and skills are in place. Next is the real build — see `HANDOFF.md` and `TASKS.md`.

## License

Product code © 2026 Helix Studio. Bundled skills in `skills/` are MIT (see `skills/LICENSE`).
