"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";

interface RevealProps {
  children: ReactNode;
  /** Stagger offset in seconds (multiply by index in a list). */
  delay?: number;
  /** Travel direction of the entrance. */
  from?: "up" | "down" | "left" | "right" | "none";
  /** Travel distance in px. */
  distance?: number;
  as?: "div" | "section" | "li" | "span";
  className?: string;
  /** Re-animate every time it enters view instead of once. */
  repeat?: boolean;
}

const OFFSETS: Record<NonNullable<RevealProps["from"]>, { x?: number; y?: number }> = {
  up: { y: 1 },
  down: { y: -1 },
  left: { x: 1 },
  right: { x: -1 },
  none: {},
};

/**
 * Scroll-reveal wrapper. Fades + slides children in when they enter the
 * viewport, respecting `prefers-reduced-motion` (renders immediately, no
 * transform). The single primitive behind every marketing section's entrance.
 */
export function Reveal({
  children,
  delay = 0,
  from = "up",
  distance = 18,
  as = "div",
  className,
  repeat = false,
}: RevealProps) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  const off = OFFSETS[from];
  const variants: Variants = {
    hidden: { opacity: 0, x: (off.x ?? 0) * distance, y: (off.y ?? 0) * distance },
    show: { opacity: 1, x: 0, y: 0 },
  };

  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: !repeat, amount: 0.25, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}
