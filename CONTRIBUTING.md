# Contributing to Helix Studio

Thanks for your interest in improving Helix Studio. This guide explains how to
propose changes and what to expect during review.

> Helix Studio is proprietary software (see [`LICENSE`](LICENSE)). Contributions
> are welcome under the terms below, and by submitting one you agree that it may
> be incorporated into the product.

## Ways to contribute

- **Report a bug** — open a [Bug report](https://github.com/durga710/helixstudio/issues/new/choose).
- **Request a feature** — open a [Feature request](https://github.com/durga710/helixstudio/issues/new/choose).
- **Improve docs** — small fixes can go straight to a pull request.
- **Report a vulnerability** — do **not** open a public issue; see [`SECURITY.md`](SECURITY.md).

## Development setup

```bash
npm install
cp .env.example .env.local
npx prisma generate
npm run dev
```

Helix runs in a seeded demo mode without a `DATABASE_URL`, so you can work on most
UI and front-end changes without a database.

## Branch & commit conventions

- Branch from `main` using a descriptive prefix: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org/):

  ```
  <type>: <short description>

  <optional body explaining what and why>
  ```

  Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

## Before you open a pull request

Run the full local gate — CI runs the same checks and **will block on lint or type errors**:

```bash
npm run lint        # ESLint — must report 0 errors
npx tsc --noEmit    # TypeScript — must be clean
npm run build       # Production build must succeed
```

- Keep PRs focused and reasonably small.
- Include a clear description and a test plan (see the PR template).
- Update docs when behavior changes.
- Make sure new UI is accessible (keyboard navigation, focus states, color contrast)
  and respects `prefers-reduced-motion`.

## Review

A maintainer will review your PR for correctness, security, performance, and
consistency with the existing patterns. Address requested changes by pushing new
commits to the same branch. Once approved and green, it will be merged.

By contributing, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
