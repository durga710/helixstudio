# Bedrock Claude Model Access — Request Sheet

**Status (verified live 2026-06-19):** ⛔ Blocked — account-level model access.
The mantle bearer key authenticates fine, but account `932316879284` holds **no
entitlement** for any Claude model. Until AWS grants access, no Claude-on-Bedrock
model is invocable and all such entries stay `confirmed: false` in
[`src/lib/ai/bedrock.ts`](../src/lib/ai/bedrock.ts).

This is a copy-paste-ready sheet for the Bedrock console "Model access" request
and/or the AWS Sales contact form.

## Account / endpoint facts

| Field | Value |
|---|---|
| AWS account id | `932316879284` |
| Region | `us-east-1` |
| Gateway host | `https://bedrock-mantle.us-east-1.api.aws/anthropic` |
| API surface | Anthropic Messages API (`POST /v1/messages`, `anthropic-version: 2023-06-01`) |
| Auth | `Authorization: Bearer <mantle key>` (the platform `AWS_BEARER_TOKEN_BEDROCK`) |
| Workspace header | `anthropic-workspace-id` — value **irrelevant to access** (see below) |

## Models to request access for

These are listed in the project (HelixReal) catalog and return **HTTP 403
`permission_error`** ("not available for this account … contact AWS Sales") — the
id is valid and the request is well-formed; only the entitlement is missing.

| Model id (exact invocation string) | Marketing name | Context |
|---|---|---|
| `anthropic.claude-opus-4-8` | Claude Opus 4.8 | 1M |
| `anthropic.claude-opus-4-7` | Claude Opus 4.7 | 1M |
| `anthropic.claude-haiku-4-5` | Claude Haiku 4.5 | 200K |

**Not in the current catalog** (return HTTP 404 `not_found_error` — do *not* request
these by this id; reconfirm the correct id if they're still wanted):

- `anthropic.claude-opus-4-6`
- `anthropic.claude-sonnet-4-6`

## What we already ruled out (so AWS support doesn't send us in circles)

- **Auth is fine.** The key authenticates: we get structured `permission_error` /
  `not_found_error` bodies, never `401` / `access_denied` / invalid-token.
- **Workspace scoping is not the blocker.** Probing with `anthropic-workspace-id:
  proj_7qtmr6yfbnkivl3eefoz` and with `anthropic-workspace-id: default` returns the
  **identical** 403 for all three models. The gate is account-level model access,
  not the workspace/project value.
- **Ids are correct.** The 403 (vs 404) on the three target models proves the host
  recognizes the id and is deliberately refusing it for lack of entitlement.

## How to verify once access is granted

Re-run the probe (reads creds from the shell env or `.env.local`):

```bash
node scripts/probe-bedrock.mjs
```

Access is live when the three target ids flip **403 → 200** ("OK — completion
returned"). At that point, set `confirmed: true` on those entries in
`src/lib/ai/bedrock.ts` so they surface in the model picker.

> Note: `scripts/probe-bedrock.mjs` reads the bearer token and is intentionally
> **not committed** (gitignored). It is a local diagnostic only.
