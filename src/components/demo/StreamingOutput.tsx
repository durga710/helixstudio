"use client";

import { useEffect, useMemo, useState } from "react";

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
 * Streams `text` a token at a time to mimic live model output. Reports
 * completion so `DemoEngine` advances only after the stream finishes — keeping
 * the terminal, agents, and progress bar in lockstep.
 */
export function StreamingOutput({
  text,
  speed = 55,
  paused = false,
  instant = false,
  onComplete,
  className,
}: StreamingOutputProps) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const total = tokens.length;

  const [shown, setShown] = useState(instant ? total : 0);

  // Reset progress when the source text (or instant mode) changes. The
  // store-previous-prop-in-render pattern keeps this out of an effect.
  const resetKey = `${text} ${instant}`;
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setShown(instant ? total : 0);
  }

  useEffect(() => {
    if (instant || shown >= total) {
      onComplete?.();
      return;
    }
    if (paused) return;
    const jitter = speed * (0.7 + Math.random() * 0.9);
    const id = window.setTimeout(() => setShown((s) => s + 1), jitter);
    return () => window.clearTimeout(id);
  }, [shown, total, speed, paused, instant, onComplete]);

  const streaming = !instant && shown < total;

  return (
    <span className={className}>
      {tokens.slice(0, shown).join("")}
      {streaming && (
        <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-px animate-pulse rounded-[1px] bg-accent/80 align-middle" />
      )}
    </span>
  );
}
