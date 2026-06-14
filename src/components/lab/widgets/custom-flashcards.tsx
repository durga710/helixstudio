"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * CustomFlashcards — a fully CONFIG-DRIVEN flip-card deck. Teachers make their own
 * about any topic in the widget store: a list of {front, back} cards. The student
 * taps a card to flip it. A distinct "matching/recall" modality, no code.
 *   config: { cards: [{ front, back }], frontLabel?, backLabel? }
 * Completes once every card has been flipped at least once (or immediately if the
 * deck is empty, so it never traps a lesson).
 */

interface CardT {
  front: string;
  back: string;
}

export function CustomFlashcards({ config, onComplete, onState }: WidgetProps) {
  const cards: CardT[] = Array.isArray(config?.cards)
    ? (config.cards as unknown[])
        .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
        .filter((c): c is Record<string, unknown> => Boolean(c))
        .map((c) => ({ front: String(c.front ?? "").slice(0, 200), back: String(c.back ?? "").slice(0, 300) }))
        .filter((c) => c.front || c.back)
    : [];

  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [seen, setSeen] = useState<Record<number, boolean>>({});
  const completed = useRef(false);

  const seenCount = Object.keys(seen).length;
  const allSeen = cards.length === 0 || seenCount >= cards.length;

  useEffect(() => {
    onState?.({ flippedCount: seenCount, total: cards.length, done: allSeen });
    if (allSeen && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenCount]);

  if (cards.length === 0) {
    return (
      <div className="grid place-items-center rounded-card border border-dashed border-border2 bg-panel2 p-8 text-center text-[12px] text-txt3">
        This flashcard deck has no cards yet — add some in the widget store.
      </div>
    );
  }

  function flip(i: number) {
    setSeen((s) => (s[i] ? s : { ...s, [i]: true }));
    setFlipped((f) => ({ ...f, [i]: !f[i] }));
  }

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <p className="mb-3 text-[12.5px] text-txt2">Tap each card to flip it. ({seenCount}/{cards.length} seen)</p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {cards.map((c, i) => {
          const isBack = flipped[i];
          return (
            <li key={i}>
              <button
                onClick={() => flip(i)}
                className="flex min-h-[88px] w-full flex-col items-center justify-center gap-1 rounded-card border border-border bg-panel p-4 text-center transition-all duration-150 hover:border-accent"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-txt3">{isBack ? "back" : "front"}</span>
                <span className="text-[13.5px] font-medium text-txt">{isBack ? c.back : c.front}</span>
                {!seen[i] && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent"><RefreshCw className="h-3 w-3" /> tap to flip</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {allSeen && <p className="mt-3 text-[12px] font-medium text-ok">You went through the whole deck — nice. 🎉</p>}
    </div>
  );
}
