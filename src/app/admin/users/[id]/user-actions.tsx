"use client";

/**
 * Admin override controls for one user: tier select, monthly token limit
 * (set/clear), reset counters, suspend/unsuspend. PATCHes
 * /api/admin/users/[id] then soft-refreshes the server-rendered page
 * (same idiom as auto-refresh.tsx).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIERS = ["free", "pro", "team"] as const;

export function UserActions({
  userId,
  isSelf,
  isGuest,
  tier,
  tokenLimit,
  suspended,
  usedThisPeriod,
}: {
  userId: string;
  isSelf: boolean;
  isGuest: boolean;
  tier: string;
  tokenLimit: number | null;
  suspended: boolean;
  usedThisPeriod: number;
}) {
  const router = useRouter();
  const [limitInput, setLimitInput] = useState(tokenLimit === null ? "" : String(tokenLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, okNote: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Update failed.");
      } else {
        setNote(okNote);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    }
    setBusy(false);
  }

  const parsedLimit = limitInput.trim() === "" ? null : Number(limitInput);
  const limitValid = parsedLimit === null || (Number.isInteger(parsedLimit) && parsedLimit >= 0);
  const wouldBlock = parsedLimit !== null && limitValid && usedThisPeriod >= parsedLimit;

  const btn =
    "rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="rounded-card-lg border border-border bg-panel p-4">
      <h2 className="mb-2 text-sm font-semibold text-txt">Admin actions</h2>

      <div className="border-b border-border/60 py-2.5">
        <div className="text-[12.5px] text-txt2">Tier</div>
        <div className="mt-1.5 flex items-center gap-2">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={busy || isGuest || t === tier}
              onClick={() => patch({ tier: t }, `Tier set to ${t}.`)}
              className={
                t === tier
                  ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-accent"
                  : btn
              }
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-txt3">
          {isGuest
            ? "Guests have no tier — they meter against the lifetime guest allowance."
            : "Stripe overwrites the tier for users with a live subscription; manual tiers stick for everyone else."}
        </p>
      </div>

      <div className="border-b border-border/60 py-2.5">
        <div className="text-[12.5px] text-txt2">Token limit (admin override)</div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={1000}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            placeholder={isGuest ? "guest default" : "tier default"}
            className="w-40 rounded-lg border border-border bg-bg2 px-3 py-1.5 font-mono text-[12px] text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !limitValid || parsedLimit === null}
            onClick={() => patch({ tokenLimit: parsedLimit }, `Limit set to ${parsedLimit?.toLocaleString()}.`)}
            className={btn}
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy || tokenLimit === null}
            onClick={() => {
              setLimitInput("");
              void patch({ tokenLimit: null }, "Limit cleared — back to the tier default.");
            }}
            className={btn}
          >
            Clear
          </button>
        </div>
        {wouldBlock && (
          <p className="mt-1.5 text-[11px] text-warn">
            Usage ({usedThisPeriod.toLocaleString()}) already meets this limit — the user is blocked immediately.
            Reset the counters below to unblock.
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-txt3">
          Absolute monthly cap — beats the tier default. 0 disables AI entirely; empty = no override.
        </p>
      </div>

      <div className="border-b border-border/60 py-2.5">
        <div className="text-[12.5px] text-txt2">Counters</div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Reset this user's token counters to zero? Usage history rows are kept.")) {
              void patch({ resetTokens: true }, "Counters reset.");
            }
          }}
          className={`mt-1.5 ${btn}`}
        >
          Reset token counters
        </button>
        <p className="mt-1.5 text-[11px] text-txt3">
          Zeroes lifetime and this-month counters (unblocks a limit-hit user). Per-call history is kept.
        </p>
      </div>

      <div className="py-2.5">
        <div className="text-[12.5px] text-txt2">Account</div>
        <button
          type="button"
          disabled={busy || isSelf}
          onClick={() => {
            const verb = suspended ? "Unsuspend" : "Suspend";
            if (window.confirm(`${verb} this account?${suspended ? "" : " They lose all API access immediately."}`)) {
              void patch({ suspended: !suspended }, suspended ? "Account reinstated." : "Account suspended.");
            }
          }}
          className={
            suspended
              ? `mt-1.5 ${btn}`
              : "mt-1.5 rounded-lg border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_9%,transparent)] px-3 py-1.5 text-[12px] font-medium text-bad hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {suspended ? "Unsuspend account" : "Suspend account"}
        </button>
        <p className="mt-1.5 text-[11px] text-txt3">
          {isSelf ? "You can't suspend your own account." : "Suspension blocks every API call within one request."}
        </p>
      </div>

      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
      {note && <p className="mt-2 text-[12px] text-ok">{note}</p>}
    </div>
  );
}
