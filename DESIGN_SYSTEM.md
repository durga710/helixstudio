# Helix Studio — Design System

## Philosophy

Premium, minimal, fast. The bar is Linear, Vercel, Stripe, and Cursor — not a generic AI aesthetic. No emoji in the product UI; use a consistent line-icon set. Restraint over decoration.

## Color

Theme tokens drive everything via CSS variables, with full **dark** and **light** modes.

- **Neutral foundation** — layered backgrounds (`--bg`, `--panel`, `--panel-2`) and borders.
- **Single accent** — user-customizable (Indigo default; Violet, Blue, Emerald, Rose, Amber). Applied live across the whole UI; never a rainbow.
- **Semantic** — green (success), amber (warning), red (danger), each derived from the accent-neutral system.

## Typography

System sans stack for UI; monospace for code, file names, and identifiers. Large, tight headings; readable body; generous line height. Avoid heavy bolding.

## Layout & spacing

8px spacing unit (`--u`), with a **compact** density option. Consistent padding, soft 1px borders, subtle shadows, clear hierarchy. Desktop-first, but every screen scales down gracefully.

## Components

Every interactive component ships with: hover, focus, loading, empty, and error states. Cards use soft borders and minimal shadow. Pills and badges are muted, not loud.

## Iconography

Single stroked line-icon system (`.ico`, ~1.7px stroke, `currentColor`). Real brand logos only for third-party tech (TypeScript, React, Node, Next.js, GitHub, Vercel, Prisma). No emoji.

## Customization (must remain live + persisted)

Theme · accent color · density · editor font size. All applied through CSS variables and stored locally.

## Accessibility

WCAG AA: keyboard navigation, visible focus, sufficient contrast in both themes, screen-reader-friendly semantics.

## Signature surfaces

- **App shell** — slim icon rail, breadcrumb top bar, command palette (⌘K).
- **Editor** — file tree + tabs + AI chat, three-pane.
- **AI chat** — streaming, plan checklists, inline reviewable diffs, agent indicators.
- **Agents** — five-stage pipeline with live status.
