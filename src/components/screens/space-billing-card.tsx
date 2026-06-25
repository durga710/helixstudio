"use client";

import { useState } from "react";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export interface SpaceBilling {
  enabled: boolean;
  active: boolean;
  seats: number;
  memberCount: number;
  memberCap: number;
  renewsAt: string | null;
}

/**
 * Owner-only plan card on the Space detail panel: usage vs caps on the free
 * plan, seats + renewal when subscribed. "Add seats" runs Stripe Checkout;
 * "Manage billing" opens the Stripe portal. Hidden entirely when the
 * deployment has no Stripe configuration (caps still apply server-side).
 */
export function SpaceBillingCard({
  spaceId,
  billing,
}: {
  spaceId: string;
  billing: SpaceBilling;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seats, setSeats] = useState(String(Math.max(billing.memberCount, 10)));
  const [busy, setBusy] = useState(false);

  async function checkout() {
    const n = parseInt(seats, 10);
    if (busy || !Number.isFinite(n) || n < 1) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: n }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        window.location.assign(json.data.url as string);
        return;
      }
      toast(json?.error?.message ?? "Couldn't start checkout.");
    } catch {
      toast("Couldn't start checkout.");
    }
    setBusy(false);
  }

  async function portal() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/billing/portal`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        window.location.assign(json.data.url as string);
        return;
      }
      toast(json?.error?.message ?? "Couldn't open billing.");
    } catch {
      toast("Couldn't open billing.");
    }
    setBusy(false);
  }

  const memberPct = billing.memberCap > 0 ? Math.min(100, Math.round((billing.memberCount / billing.memberCap) * 100)) : 0;

  return (
    <Card variant="lit" className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border2 bg-panel2">
          <CreditCard className="h-4 w-4 text-txt2" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-txt">
              {billing.active ? `${billing.seats} seats` : "Free plan"}
            </span>
            {billing.active ? (
              <Pill tone="green">active</Pill>
            ) : (
              <Pill tone="neutral">free</Pill>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] text-txt3">
            {billing.memberCount} of {billing.memberCap} members
            {billing.renewsAt
              ? ` · renews ${new Date(billing.renewsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : ""}
          </p>
          <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-panel3">
            <div
              className={memberPct >= 100 ? "h-full bg-warn" : "h-full bg-accent"}
              style={{ width: `${memberPct}%` }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {!billing.enabled ? (
            <span className="text-[11px] text-txt3">Billing not configured</span>
          ) : billing.active ? (
            <Button variant="ghost" onClick={() => void portal()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Manage billing"}
            </Button>
          ) : (
            <Button variant="glow" onClick={() => setDialogOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Upgrade
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader
            title="Upgrade this space"
            description="Per-seat subscription. Buy a seat for each member."
          />
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void checkout();
            }}
          >
            <label className="flex items-center gap-3 text-sm text-txt2">
              Seats
              <Input
                type="number"
                min={Math.max(1, billing.memberCount)}
                max={500}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                aria-label="Number of seats"
                className="max-w-[120px]"
              />
            </label>
            <p className="text-[11.5px] text-txt3">
              You&apos;ll confirm the price on the secure checkout page. Seats can be changed or
              cancelled any time from Manage billing.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Continue to checkout"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
