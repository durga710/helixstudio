import "server-only";

/**
 * Amazon Bedrock — platform-default models, served via Helix's own Bedrock
 * account (one bearer token, no per-user creds). These surface in the UI as
 * STANDALONE model options (no "Bedrock" category); Bedrock is hidden plumbing.
 *
 * Config reverse-engineered + verified live against the account's console
 * (2026-06-15). The mantle host exposes BOTH protocols on one bearer key:
 *
 *   Claude   → {host}/anthropic        x-api-key: <token>
 *                                       anthropic-version: 2023-06-01
 *                                       anthropic-workspace-id: <project>
 *              model ids: anthropic.claude-*
 *              transport: runAnthropicAgent (Anthropic SDK w/ baseURL + headers)
 *
 *   GPT/…    → {host}/openai/v1         Authorization: Bearer <token>
 *                                       openai-project: <project>
 *              model ids: openai.* / qwen.* / zai.* …
 *              transport: runLocalAgent (OpenAI-compatible w/ baseURL + header)
 *
 * where {host} = https://bedrock-mantle.${BEDROCK_REGION}.api.aws
 *
 * STATUS (live probe 2026-06-19): the account (932316879284) is entitled to
 * EXACTLY two models — openai.gpt-oss-120b-1:0 and openai.gpt-oss-20b-1:0 (both
 * 200 + tool_calls on the runtime endpoint). Every Claude id is 403/404 and the
 * other OpenAI-protocol ids are 401/400 (no entitlement — see
 * docs/BEDROCK-MODEL-ACCESS.md). Each entry carries `confirmed`/`idNeedsConfirm`
 * so the dispatch + UI gate on what's actually live (`liveBedrockModels()`).
 */

export type BedrockProtocol = "anthropic" | "openai";

export interface BedrockModel {
  /** The exact Bedrock invocation id — also the value stored in
   *  UserPreferences.aiModel when this model is selected. */
  modelId: string;
  /** User-facing name (rendered as a standalone option in the picker). */
  label: string;
  /** Which Bedrock API surface this model speaks. */
  protocol: BedrockProtocol;
  /** Short context-window hint for the picker (display only). */
  contextLabel?: string;
  /** True once a live completion has been verified (model access enabled). */
  confirmed: boolean;
  /** True when the exact `modelId` still needs confirming against the console
   *  Model catalog (non-Claude provider ids vary; Claude ids are confirmed). */
  idNeedsConfirm?: boolean;
  /** Which Bedrock host to call. "mantle" (project-scoped, default) or the
   *  generic "runtime" host. */
  endpoint?: "mantle" | "runtime";
  /** Region override (defaults to BEDROCK_REGION). Some models live elsewhere. */
  region?: string;
  /** Send the project header (anthropic-workspace-id / openai-project). Default
   *  true; set false for generic-runtime models that reject it. */
  project?: boolean;
}

/* --------------------------- env / endpoints --------------------------- */

const DEFAULT_REGION = "us-east-1";
/** A generic placeholder Bedrock can serve on the OpenAI route — handy for a
 *  smoke test of the transport once a real key is set (proven to return 200 on
 *  the generic us-west-2 runtime endpoint during setup). Not a user-facing model. */
export const BEDROCK_SMOKE_TEST_MODEL = "openai.gpt-oss-20b-1:0";

export function bedrockRegion(): string {
  return process.env.BEDROCK_REGION?.trim() || DEFAULT_REGION;
}

/** The platform bearer token (AWS Bedrock API key). Empty when not configured.
 * Trimmed: a trailing newline/space from a dashboard paste makes AWS reject the
 * credential with "security token invalid", which is maddening to diagnose. */
export function bedrockBearerToken(): string | undefined {
  return process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() || undefined;
}

/** The HelixReal project the mantle key is scoped to. Confirmed as the docs'
 *  default `anthropic-workspace-id` (Live API docs, 2026-06-18). Claude on the
 *  mantle host REJECTS unscoped requests with access_denied, so this header must
 *  always be sent — we fall back to the known project id when the env is unset
 *  rather than silently dropping the header. Override via BEDROCK_WORKSPACE_ID. */
const DEFAULT_WORKSPACE_ID = "proj_7qtmr6yfbnkivl3eefoz";

/** The Bedrock project/workspace the key is scoped to. */
export function bedrockWorkspaceId(): string | undefined {
  return process.env.BEDROCK_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE_ID;
}

/** Bedrock is wired when a bearer token is present. */
export function bedrockEnabled(): boolean {
  return Boolean(bedrockBearerToken());
}

function mantleHost(): string {
  return `https://bedrock-mantle.${bedrockRegion()}.api.aws`;
}

export function bedrockAnthropicBaseUrl(): string {
  return `${mantleHost()}/anthropic`;
}

export function bedrockOpenAiBaseUrl(): string {
  return `${mantleHost()}/openai/v1`;
}

/* ------------------------------- registry ------------------------------ */

/**
 * The coding-capable model set the user picked. Each appears as its own option.
 *
 * Only the two GPT-OSS entries are `confirmed: true` (live access proven). Claude
 * ids use the `anthropic.<alias>` format but are entitlement-blocked on this
 * account; other non-Claude ids follow Bedrock's `provider.model[-version]`
 * pattern and still need confirming against the console catalog (`idNeedsConfirm`).
 * Anything not `confirmed` returns 4xx until a live probe returns a real completion.
 */
export const BEDROCK_MODELS: BedrockModel[] = [
  // ---- LIVE on this account — the only models with confirmed access ----
  // Open-weight GPT-OSS on the OpenAI-compatible Bedrock RUNTIME endpoint. A
  // live probe (2026-06-19) returns HTTP 200 + a clean `tool_calls` response
  // for BOTH sizes — they're the only models account 932316879284 is entitled
  // to (every Claude id is 403/404; GPT-5.x are 401; GLM/Qwen 400). The runtime
  // route takes no project header (project:false). See docs/BEDROCK-MODEL-ACCESS.md.
  // 120B is the platform default (strongest accessible); 20B is the faster/cheaper
  // option — note it can degrade to narrating instead of calling tools on long
  // multi-tool builds, so prefer 120B for real Engineer runs.
  {
    modelId: "openai.gpt-oss-120b-1:0",
    label: "GPT-OSS 120B",
    protocol: "openai",
    contextLabel: "open weight",
    confirmed: true,
    endpoint: "runtime",
    project: false,
  },
  {
    modelId: BEDROCK_SMOKE_TEST_MODEL, // openai.gpt-oss-20b-1:0
    label: "GPT-OSS 20B",
    protocol: "openai",
    contextLabel: "open weight",
    confirmed: true,
    endpoint: "runtime",
    region: "us-west-2",
    project: false,
  },

  // ---- Anthropic protocol (Claude) — served on the mantle /anthropic gateway ----
  // The catalog + Live API docs (verified 2026-06-18) confirm the id form is
  // `anthropic.claude-<family>-<major>-<minor>` (the docs' own example is
  // `anthropic.claude-haiku-4-5`) and that requests MUST carry the
  // `anthropic-workspace-id` project header or the host returns access_denied
  // — that header is now always sent (see DEFAULT_WORKSPACE_ID above).
  //
  // The PROJECT catalog (HelixReal) LISTS Opus 4.8 + Opus 4.7 (1M context,
  // text+image) and Haiku 4.5, but a workspace-scoped probe (2026-06-18) returns
  // HTTP 403 "anthropic.<id> is not available for this account" for ALL of them
  // — i.e. the ids are right and the request is well-formed, but account 932316879284
  // holds no model entitlement (the console gates access behind "contact AWS Sales").
  // So `confirmed` stays false: they're off the picker until the account is actually
  // granted access and a live completion comes back. Opus 4.6 / Sonnet 4.6 are not
  // in the current catalog at all.
  { modelId: "anthropic.claude-opus-4-8", label: "Claude Opus 4.8", protocol: "anthropic", contextLabel: "1M context", confirmed: false },
  { modelId: "anthropic.claude-opus-4-7", label: "Claude Opus 4.7", protocol: "anthropic", contextLabel: "1M context", confirmed: false },
  { modelId: "anthropic.claude-haiku-4-5", label: "Claude Haiku 4.5", protocol: "anthropic", contextLabel: "200K context", confirmed: false },

  // ---- Anthropic protocol (Claude) — not in the current catalog; reconfirm ----
  { modelId: "anthropic.claude-opus-4-6", label: "Claude Opus 4.6", protocol: "anthropic", contextLabel: "1M context", confirmed: false, idNeedsConfirm: true },
  { modelId: "anthropic.claude-sonnet-4-6", label: "Claude Sonnet 4.6", protocol: "anthropic", contextLabel: "1M context", confirmed: false, idNeedsConfirm: true },

  // ---- OpenAI protocol (GPT / GLM / Qwen) — ids best-known, confirm in console ----
  { modelId: "openai.gpt-5.5", label: "GPT-5.5", protocol: "openai", contextLabel: "272K context", confirmed: false, idNeedsConfirm: true },
  { modelId: "openai.gpt-5.4", label: "GPT-5.4", protocol: "openai", contextLabel: "272K context", confirmed: false, idNeedsConfirm: true },
  { modelId: "zai.glm-5", label: "GLM 5", protocol: "openai", contextLabel: "200K context", confirmed: false, idNeedsConfirm: true },
  { modelId: "zai.glm-4.7-flash", label: "GLM 4.7 Flash", protocol: "openai", contextLabel: "203K context", confirmed: false, idNeedsConfirm: true },
  { modelId: "qwen.qwen3-coder-next", label: "Qwen3 Coder Next", protocol: "openai", contextLabel: "256K context", confirmed: false, idNeedsConfirm: true },
];

const BY_ID = new Map(BEDROCK_MODELS.map((m) => [m.modelId, m]));

/** True when `modelId` is one of our Bedrock-served models. */
export function isBedrockModel(modelId: string): boolean {
  return BY_ID.has(modelId);
}

export function getBedrockModel(modelId: string): BedrockModel | undefined {
  return BY_ID.get(modelId);
}

/** Models safe to surface to users right now (live access confirmed). */
export function liveBedrockModels(): BedrockModel[] {
  return BEDROCK_MODELS.filter((m) => m.confirmed);
}

/* ------------------------------ resolution ----------------------------- */

/** Everything a runner needs to call a Bedrock model with the platform key. */
export interface BedrockResolved {
  protocol: BedrockProtocol;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  /** Project-scoping (+ version) headers to merge into the request. */
  headers: Record<string, string>;
}

/**
 * Resolve a selected Bedrock model into transport config, or null when the id
 * isn't ours or the platform key isn't set. The caller routes `protocol`:
 *   "anthropic" → runAnthropicAgent({ baseUrl, apiKey, extraHeaders })
 *   "openai"    → runLocalAgent({ baseUrl, apiKey, extraHeaders })
 */
export function resolveBedrockModel(modelId: string): BedrockResolved | null {
  const model = BY_ID.get(modelId);
  const apiKey = bedrockBearerToken();
  if (!model || !apiKey) return null;

  const region = model.region ?? bedrockRegion();
  const useProject = model.project !== false;
  const workspaceId = bedrockWorkspaceId() ?? "";

  if (model.protocol === "anthropic") {
    // Claude is only served on the mantle host.
    return {
      protocol: "anthropic",
      modelId: model.modelId,
      baseUrl: `https://bedrock-mantle.${region}.api.aws/anthropic`,
      apiKey,
      headers: {
        "anthropic-version": "2023-06-01",
        ...(useProject && workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
      },
    };
  }
  const baseUrl =
    model.endpoint === "runtime"
      ? `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`
      : `https://bedrock-mantle.${region}.api.aws/openai/v1`;
  return {
    protocol: "openai",
    modelId: model.modelId,
    baseUrl,
    apiKey,
    headers: useProject && workspaceId ? { "openai-project": workspaceId } : {},
  };
}
