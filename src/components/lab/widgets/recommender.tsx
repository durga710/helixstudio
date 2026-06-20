"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ThumbsUp, X, Heart, Frown, RotateCcw, Shuffle } from "lucide-react";
import type { WidgetProps } from "./index";

/*
 * Recommender — a recommendation system you steer. A viewer has clear tastes;
 * the learner decides which titles to recommend vs skip. Recommending things
 * that match their taste = a hit (they watch); mismatches = a miss (they bounce).
 * A "shuffle" button recommends at random to show how a clueless feed empties
 * the room. Deterministic — no AI spend. Teaches: recommenders learn your
 * patterns and predict what you'll enjoy. Completes on a high hit-rate.
 */

interface Item { title: string; genre: string }
const LIKES = ["Action", "Space"];
const DISLIKES = ["Romance"];
const DECK: Item[] = [
  { title: "Star Raiders", genre: "Space" },
  { title: "Love in Paris", genre: "Romance" },
  { title: "Mega Chase", genre: "Action" },
  { title: "Cooking Hour", genre: "Cooking" },
  { title: "Orbit Wars", genre: "Space" },
  { title: "Heart Letters", genre: "Romance" },
  { title: "Fist of Fury", genre: "Action" },
  { title: "Quiet Meadow", genre: "Drama" },
];
const GOAL = 70; // hit-rate %

export function Recommender({ onComplete, onState }: WidgetProps) {
  const [i, setI] = useState(0);
  const [hits, setHits] = useState(0);
  const [recos, setRecos] = useState(0);
  const [last, setLast] = useState<null | { hit: boolean; title: string }>(null);
  const completed = useRef(false);

  const done = i >= DECK.length;
  const hitRate = recos === 0 ? 0 : Math.round((hits / recos) * 100);
  const liked = useMemo(() => new Set(LIKES), []);

  useEffect(() => {
    onState?.({ served: recos, hits, hitRate, done });
    if (done && recos >= 3 && hitRate >= GOAL && !completed.current) {
      completed.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recos, hits, done, hitRate]);

  function decide(recommend: boolean, item: Item) {
    if (recommend) {
      const hit = liked.has(item.genre);
      setRecos((r) => r + 1);
      if (hit) setHits((h) => h + 1);
      setLast({ hit, title: item.title });
    } else {
      setLast(null);
    }
    setI((x) => x + 1);
  }

  function shuffleAll() {
    // Recommend everything blindly → lots of misses; teaches "random feed loses users"
    let h = 0;
    DECK.forEach((it) => { if (liked.has(it.genre)) h++; });
    setHits(h); setRecos(DECK.length); setI(DECK.length); setLast(null);
  }

  function reset() { setI(0); setHits(0); setRecos(0); setLast(null); }

  const item = DECK[i];

  return (
    <div className="rounded-card border border-border bg-panel2 p-4">
      <div className="mb-3 rounded-[10px] border border-border bg-panel p-3">
        <div className="text-[11px] uppercase tracking-wide text-txt3">This viewer</div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
          {LIKES.map((g) => <span key={g} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-ok" style={{ background: "color-mix(in srgb, var(--ok) 14%, transparent)" }}><Heart className="h-3 w-3" /> {g}</span>)}
          {DISLIKES.map((g) => <span key={g} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-bad" style={{ background: "color-mix(in srgb, var(--bad) 12%, transparent)" }}><Frown className="h-3 w-3" /> {g}</span>)}
        </div>
      </div>

      {!done ? (
        <div className="rounded-[10px] border border-border bg-panel p-4 text-center">
          <div className="text-[11px] text-txt3">{i + 1} of {DECK.length}</div>
          <div className="mt-1 text-[16px] font-semibold text-txt">{item.title}</div>
          <div className="mt-0.5 text-[12px] text-txt3">{item.genre}</div>
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => decide(true, item)} className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110">
              <ThumbsUp className="h-4 w-4" /> Recommend
            </button>
            <button onClick={() => decide(false, item)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel2 px-4 py-2 text-[13px] text-txt2 transition-colors hover:border-accent hover:text-txt">
              <X className="h-4 w-4" /> Skip
            </button>
          </div>
          {last && (
            <div className="mt-3 text-[12px]" style={{ color: last.hit ? "var(--ok)" : "var(--bad)" }}>
              {last.hit ? `They loved "${last.title}" — watched the whole thing! ❤️` : `They bounced off "${last.title}". 👎`}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border px-3.5 py-3 text-center" style={{ borderColor: `color-mix(in srgb, var(--${hitRate >= GOAL ? "ok" : "warn"}) 45%, transparent)` }}>
          <div className="text-[26px] font-bold tabular-nums" style={{ color: hitRate >= GOAL ? "var(--ok)" : "var(--warn)" }}>{hitRate}%</div>
          <div className="text-[12px] text-txt3">hit rate · {hits}/{recos} recommendations watched</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
            {hitRate >= GOAL ? "You learned this viewer's taste and predicted what they'd enjoy — that's a recommender." : "Lots of misses — the feed didn't match their taste, so they kept bouncing. Match the patterns."}
          </p>
          <button onClick={reset} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt">
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11.5px] text-txt3">
        <span>Hit rate: <b className="tabular-nums text-txt2">{hitRate}%</b></span>
        {!done && (
          <button onClick={shuffleAll} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
            <Shuffle className="h-3.5 w-3.5" /> Recommend at random
          </button>
        )}
      </div>
    </div>
  );
}
