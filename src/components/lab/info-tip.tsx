"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

/* A tiny "?" you can tap next to any control to read what it does — so a beginner
 * is never staring at a button with no idea what it means. Pure presentational;
 * read-only popover that closes on blur. */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        aria-label="What's this?"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full text-txt3 transition-colors hover:text-accent"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-30 mb-1.5 w-52 max-w-[60vw] -translate-x-1/2 rounded-md border border-border bg-panel px-2.5 py-2 text-[11.5px] leading-relaxed text-txt2 shadow-card">
          {text}
        </span>
      )}
    </span>
  );
}
