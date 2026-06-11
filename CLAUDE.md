I'll give you a professional AI IDE project structure that works extremely well with Claude, Cursor, Windsurf, Codex, and Helix Studio.

# CLAUDE.md

## Mission

You are Helix Studio.

An elite autonomous software engineering system.

Your goals:

* Understand requirements deeply
* Design scalable solutions
* Write production-grade code
* Maintain code quality
* Improve developer productivity

## Workflow

1. Understand
2. Analyze
3. Plan
4. Implement
5. Review
6. Validate

Never skip reasoning.

## Coding Standards

* Type-safe code
* Reusable components
* Strong error handling
* Secure defaults
* Performance-focused
* Accessible UI

## Architecture Rules

* Prefer modular systems
* Avoid duplication
* Use dependency injection where appropriate
* Keep business logic separate from UI

## Output Expectations

Always provide:

* Summary
* Plan
* Implementation
* Review
* Risks
* Next Steps

## Security Requirements

Check for:

* XSS
* SQL Injection
* Authentication flaws
* Authorization flaws
* Secret leakage

## Performance Requirements

Review:

* Bundle size
* Database queries
* API latency
* Rendering efficiency

## Design Quality

UI should feel comparable to:

* Cursor
* Linear
* Vercel
* Notion
* Stripe

Always think before coding.

# PRODUCT.md

# Helix Studio Product Vision

## Overview

Helix Studio is an AI-powered software engineering environment.

Users can:

* Chat with AI
* Generate code
* Edit repositories
* Build applications
* Debug projects
* Design interfaces
* Deploy software

## Core Features

### AI Chat

Repository-aware chat.

### Code Generation

Generate production-ready code.

### File Editing

Modify existing files safely.

### Multi-Agent System

Architect
Engineer
Reviewer
Security Auditor
Performance Engineer

### Repository Indexing

Understand entire codebases.

### Memory

Remember project decisions.

### Terminal Agent

Execute commands safely.

### Deployment Agent

Deploy applications.

## Target Users

* Developers
* Founders
* Agencies
* Students
* Engineering Teams

## Competitive Targets

* Cursor
* Windsurf
* Claude Code
* GitHub Copilot

## Success Metrics

* Faster development
* Fewer bugs
* Better code quality
* Better UX

# ARCHITECTURE.md

## High-Level Architecture

Frontend

* Next.js
* TypeScript
* TailwindCSS
* shadcn/ui

Backend

* Node.js
* API Routes

Database

* PostgreSQL
* Prisma

Authentication

* Auth.js

Hosting

* Vercel

Vector Database

* Qdrant

AI Providers

* OpenAI
* Anthropic
* Google

## Core Services

### User Service

Authentication
Profiles
Settings

### AI Service

Model routing
Prompt assembly
Agent orchestration

### Memory Service

Project memory
Conversation memory

### Repository Service

Indexing
Embeddings
Search

### Terminal Service

Sandbox execution

### Deployment Service

Deployments

## Agent Pipeline

User Request

↓

Planner

↓

Repository Analyzer

↓

Architect

↓

Engineer

↓

Reviewer

↓

Security Auditor

↓

Performance Auditor

↓

Final Output

## Scalability

* Stateless API layer
* Cached embeddings
* Background workers
* Queue processing
* Horizontal scaling

# DESIGN_SYSTEM.md

## Design Philosophy

Premium.
Minimal.
Fast.

Inspired by:

* Linear
* Cursor
* Vercel
* Stripe
* Notion

## Typography

Headings:

* Large
* Clean
* Bold

Body:

* Readable
* Spacious

## Layout

8px spacing system.

Use:

* Consistent padding
* Generous whitespace
* Clear hierarchy

## Colors

Primary:

* Neutral

Accent:

* Single accent color

Avoid rainbow UIs.

## Components

Every component needs:

* Loading state
* Error state
* Empty state
* Hover state
* Focus state

## Accessibility

WCAG compliance.

Requirements:

* Keyboard navigation
* Focus indicators
* Color contrast
* Screen reader support

## Responsive Design

Desktop First.

Must support:

* Mobile
* Tablet
* Desktop

## Dashboard Standards

* Left Sidebar
* Top Navigation
* Command Palette
* Search
* Activity Feed

## AI Chat Standards

* Streaming responses
* Code blocks
* File references
* Agent indicators
* Context awareness

# TASKS.md

# Phase 1 - Foundation

## Infrastructure

* Setup Next.js
* Setup TypeScript
* Setup Tailwind
* Setup Prisma
* Setup PostgreSQL
* Setup Authentication

## UI

* Landing Page
* Dashboard
* Sidebar
* Command Palette

## AI

* Chat Interface
* Model Routing

---

# Phase 2 - Repository Intelligence

## Features

* File Upload
* Repository Import
* Repository Parsing
* Embeddings
* Semantic Search

---

# Phase 3 - Agents

## Planner Agent

Task planning.

## Architect Agent

Solution design.

## Engineer Agent

Code generation.

## Reviewer Agent

Code review.

## Security Agent

Security review.

## Performance Agent

Performance review.

---

# Phase 4 - Developer Tools

## Terminal

Sandbox execution.

## File Editor

Inline editing.

## Diff Viewer

Git-style changes.

## Test Runner

Automated testing.

---

# Phase 5 - Memory

## User Memory

Preferences.

## Project Memory

Project decisions.

## Agent Memory

Task history.

---

# Phase 6 - Deployments

## Vercel Deployments

One-click deployment.

## Logs

Application logs.

## Monitoring

Performance monitoring.

---

# Phase 7 - Enterprise

## Teams

Shared workspaces.

## RBAC

Permissions.

## Audit Logs

Security compliance.

## SSO

Enterprise login.

### Recommended Project Structure

```text
helix-studio/
│
├── CLAUDE.md
├── PRODUCT.md
├── ARCHITECTURE.md
├── DESIGN_SYSTEM.md
├── TASKS.md
│
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   ├── SECURITY.md
│   ├── DEPLOYMENT.md
│   └── AGENTS.md
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── ai/
│   ├── database/
│   ├── agents/
│   ├── memory/
│   └── embeddings/
│
└── infrastructure/
    ├── vercel/
    ├── docker/
    └── monitoring/
```

This is essentially the same documentation structure used by advanced AI coding platforms, giving Claude and other coding agents persistent context about product goals, architecture, design standards, and implementation priorities.
