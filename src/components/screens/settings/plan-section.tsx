"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface PlanInfo {
  tier: string; // guest | free | pro | team
  used: number;
  limit: number | null; // null = unlimited
  periodStart: string;
  upgradesEnabled: boolean;
  manageable: boolean;
  renewsAt: string | null;
}

const TIER_LABEL: Record<string, string> = {
  guest: "Guest",
  free: "Free",
  pro: "Pro",
  team: "Team",
};

/**
 * Plan & usage: the signed-in user's tier, this month's AI token spend
 * against their quota, and (when Stripe is configured) upgrade / manage
 * buttons. Hidden entirely in demo mode or when the fetch fails.
 */
export function PlanSection() {
  const { toast } = useToast();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/plan", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) setPlan(json.data as PlanInfo);
        else setUnavailable(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function go(key: string, path: string, body?: unknown) {
    setBusy(key);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.data?.url) {
        window.location.assign(json.data.url as string);
        return;
      }
      toast(json?.error?.message ?? "Couldn't open billing.");
    } catch {
      toast("Network error.");
    }
    setBusy(null);
  }

  if (unavailable) {
    return (
      <>
        <h3 className="mb-[11px] mt-6 text-sm font-semibold">Plan &amp; usage</h3>
        <Card className="px-[18px] py-[15px]">
          <p className="text-xs text-txt3">
            Plan &amp; billing is unavailable in this environment (no database / billing not configured).
          </p>
        </Card>
      </>
    );
  }

  const pct =
    plan && plan.limit !== null && plan.limit > 0 ? Math.min(100, Math.round((plan.used / plan.limit) * 100)) : null;

  return (
    <>
      <h3 className="mb-[11px] mt-6 text-sm font-semibold">Plan &amp; usage</h3>
      <Card className="px-[18px] py-[15px]">
        {!plan ? (
          <div className="flex items-center gap-2 py-2 text-xs text-txt3">
            <Loader2 size={13} className="animate-spin" /> Loading plan…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{TIER_LABEL[plan.tier] ?? plan.tier} plan</span>
                  <Pill tone={plan.tier === "free" || plan.tier === "guest" ? "amber" : "green"}>
                    {plan.limit === null ? "unlimited tokens" : `${plan.limit.toLocaleString()} tokens/mo`}
                  </Pill>
                </div>
                <div className="mt-1 text-xs text-txt2">
                  {plan.used.toLocaleString()} AI tokens used
                  {plan.tier === "guest" ? " (guest allowance is lifetime)" : " this month"}
                  {plan.renewsAt ? ` · renews ${new Date(plan.renewsAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {plan.upgradesEnabled && plan.tier !== "team" && (
                  <>
                    {plan.tier !== "pro" && (
                      <Button onClick={() => go("pro", "/api/billing/checkout", { tier: "pro" })} disabled={busy !== null}>
                        {busy === "pro" ? <Loader2 size={13} className="animate-spin" /> : "Upgrade to Pro"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => go("team", "/api/billing/checkout", { tier: "team" })}
                      disabled={busy !== null}
                    >
                      {busy === "team" ? <Loader2 size={13} className="animate-spin" /> : "Upgrade to Team"}
                    </Button>
                  </>
                )}
                {plan.manageable && (
                  <Button variant="ghost" onClick={() => go("portal", "/api/billing/portal")} disabled={busy !== null}>
                    {busy === "portal" ? <Loader2 size={13} className="animate-spin" /> : "Manage billing"}
                  </Button>
                )}
              </div>
            </div>
            {pct !== null && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                  <div
                    className={pct >= 90 ? "h-full rounded-full bg-bad" : "h-full rounded-full bg-accent"}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-txt3">{pct}% of the monthly quota</div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
