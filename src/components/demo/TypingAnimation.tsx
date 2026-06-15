"use client";

import { useEffect, useState } from "react";

interface TypingAnimationProps {
  /** Full string to type out. */
  text: string;
  /** Avg ms per character (jittered slightly for a human feel). */
  speed?: number;
  /** Pause typing (e.g. while the demo is hovered or off-screen). */
  paused?: boolean;
  /** Skip the animation and render the full string immediately. */
  instant?: boolean;
  /** Fires once the full string has been typed. */
  onDone?: () => void;
  /** Show a blinking block caret after the typed text. */
  caret?: boolean;
  className?: string;
}

/**
 * Types `text` one character at a time. Honors `paused` (holds position) and
 * `instant` (reduced-motion / SSR fallback), and fires `onDone` from its effect
 * once the string — or the instant render — is complete.
 */
export function TypingAnimation({
  text,
  speed = 42,
  paused = false,
  instant = false,
  onDone,
  caret = true,
  className,
}: TypingAnimationProps) {
  const [count, setCount] = useState(instant ? text.length : 0);

  // Reset when the source text (or instant mode) changes — kept in render via
  // the store-previous-prop pattern rather than a setState-in-effect.
  const resetKey = `${text} ${instant}`;
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setCount(instant ? text.length : 0);
  }

  useEffect(() => {
    if (instant || count >= text.length) {
      onDone?.();
      return;
    }
    if (paused) return;
    // Type punctuation a touch slower; jitter the rest for life.
    const ch = text[count];
    const base = ch === " " ? speed * 0.5 : /[.,—"“”]/.test(ch ?? "") ? speed * 2.2 : speed;
    const jitter = base * (0.6 + Math.random() * 0.8);
    const id = window.setTimeout(() => setCount((c) => c + 1), jitter);
    return () => window.clearTimeout(id);
  }, [count, text, speed, paused, instant, onDone]);

  const done = count >= text.length;

  return (
    <span className={className}>
      {text.slice(0, count)}
      {caret && (
        <span
          aria-hidden
          className="ml-px inline-block w-[7px] translate-y-[1px] align-middle"
          style={{
            // Solid while typing, blinking once finished.
            animation: done ? "helix-caret-blink 1s step-end infinite" : undefined,
          }}
        >
          ▋
        </span>
      )}
    </span>
  );
}
