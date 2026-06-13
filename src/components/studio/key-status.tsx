"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type KeyState = "idle" | "checking" | "valid" | "invalid";

export interface KeyVerdict {
  valid: boolean;
  usingServerKey: boolean;
  reason?: string;
}

/** Validate the SAVED config for a provider (the chat uses the same
 * resolution). Returns null on a network/transport failure. */
export async function validateAiKey(
  provider: "openai" | "anthropic" | "local" | "gemini",
): Promise<KeyVerdict | null> {
  try {
    const res = await fetch("/api/ai/validate-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return null;
    return json.data as KeyVerdict;
  } catch {
    return null;
  }
}

/** A dot + label that reads grey (checking) → green (works) → red (invalid). */
export function KeyStatusDot({
  state,
  message,
  className,
}: {
  state: KeyState;
  message?: string | null;
  className?: string;
}) {
  if (state === "idle") return null;
  if (state === "checking") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-txt3", className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> checking key…
      </span>
    );
  }
  const ok = state === "valid";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px]", ok ? "text-ok" : "text-bad", className)}
      title={message ?? undefined}
    >
      <span className={cn("h-2 w-2 rounded-full", ok ? "bg-ok" : "bg-bad")} />
      {ok ? "AI key works" : message || "Invalid API key"}
    </span>
  );
}
