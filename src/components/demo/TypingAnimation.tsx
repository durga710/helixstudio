"use client";

import { useEffect, useRef, useState } from "react";

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
 * Types `text` one character at a time. Self-contained: it owns its own timer
 * so per-character animation never re-renders the parent demo engine. Honors
 * `paused` (holds position) and `instant` (reduced-motion / SSR fallback).
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
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Reset when the source text changes (e.g. scenario rotates).
  useEffect(() => {
    setCount(instant ? text.length : 0);
  }, [text, instant]);

  // Fire completion for the instant path exactly once.
  useEffect(() => {
    if (instant) onDoneRef.current?.();
  }, [instant, text]);

  useEffect(() => {
    if (instant || paused) return;
    if (count >= text.length) {
      onDoneRef.current?.();
      return;
    }
    // Type punctuation a touch slower; jitter the rest for life.
    const ch = text[count];
    const base = ch === " " ? speed * 0.5 : /[.,—"“”]/.test(ch ?? "") ? speed * 2.2 : speed;
    const jitter = base * (0.6 + Math.random() * 0.8);
    const id = window.setTimeout(() => setCount((c) => c + 1), jitter);
    return () => window.clearTimeout(id);
  }, [count, text, speed, paused, instant]);

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
