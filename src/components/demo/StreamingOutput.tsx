"use client";

import { useEffect, useRef, useState } from "react";

interface StreamingOutputProps {
  /** Text to reveal token-by-token. */
  text: string;
  /** Avg ms between tokens. */
  speed?: number;
  /** Hold streaming in place. */
  paused?: boolean;
  /** Render whole string at once (reduced motion / SSR). */
  instant?: boolean;
  /** Fired once the full string is revealed. */
  onComplete?: () => void;
  className?: string;
}

/** Split into "tokens" — whitespace-preserving chunks, for an LLM-ish cadence. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [text];
}

/**
 * Streams `text` a token at a time to mimic live model output. Owns its timer
 * and reports completion so `DemoEngine` can advance only after the stream
 * finishes — keeping the terminal, agents, and progress bar in lockstep.
 */
export function StreamingOutput({
  text,
  speed = 55,
  paused = false,
  instant = false,
  onComplete,
  className,
}: StreamingOutputProps) {
  const tokens = useRef<string[]>([]);
  if (tokens.current.join("") !== text) tokens.current = tokenize(text);

  const [shown, setShown] = useState(instant ? tokens.current.length : 0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setShown(instant ? tokens.current.length : 0);
  }, [text, instant]);

  useEffect(() => {
    if (instant) {
      onCompleteRef.current?.();
      return;
    }
    if (paused) return;
    if (shown >= tokens.current.length) {
      onCompleteRef.current?.();
      return;
    }
    const jitter = speed * (0.7 + Math.random() * 0.9);
    const id = window.setTimeout(() => setShown((s) => s + 1), jitter);
    return () => window.clearTimeout(id);
  }, [shown, text, speed, paused, instant]);

  const streaming = !instant && shown < tokens.current.length;

  return (
    <span className={className}>
      {tokens.current.slice(0, shown).join("")}
      {streaming && (
        <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-px animate-pulse rounded-[1px] bg-accent/80 align-middle" />
      )}
    </span>
  );
}
