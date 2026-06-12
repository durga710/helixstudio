/**
 * API response helpers.
 *
 * Every API route should return one of these so the client knows the
 * envelope ahead of time:
 *
 *   { ok: true,  data: T }
 *   { ok: false, error: { code, message, details? } }
 */

import { NextResponse } from "next/server";
import { z, type ZodError } from "zod";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiOk<T> | ApiErr;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, init);
}

export function err(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErr>(
    { ok: false, error: { code, message, details } },
    { status }
  );
}

/** Common error helpers — keeps status codes consistent. */
export const apiErrors = {
  unauthorized: () => err("UNAUTHORIZED", "Authentication required", 401),
  forbidden: () => err("FORBIDDEN", "Access denied", 403),
  notFound: (entity = "Resource") => err("NOT_FOUND", `${entity} not found`, 404),
  rateLimit: (resetMs: number) =>
    err("RATE_LIMITED", "Too many requests", 429, { retryAt: resetMs }),
  badRequest: (msg: string, details?: unknown) => err("BAD_REQUEST", msg, 400, details),
  validation: (zErr: ZodError) => err("VALIDATION_ERROR", "Invalid input", 400, z.flattenError(zErr)),
  conflict: (msg: string) => err("CONFLICT", msg, 409),
  // A free-tier cap was hit; the client offers the Space upgrade flow.
  upgradeRequired: (msg: string) => err("UPGRADE_REQUIRED", msg, 402),
  internal: () => err("INTERNAL_ERROR", "Something went wrong", 500),
  // GitHub not connected, or the token was revoked/expired. The client shows
  // a "Connect GitHub" prompt on this code.
  githubUnauthorized: () =>
    err("GITHUB_UNAUTHORIZED", "GitHub is not connected (or the token was revoked).", 401),
};
