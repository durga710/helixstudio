"use client";

// Dashboard — the app's home. The stat cards + the "main feature" region below are
// placeholders: relabel the stats for real metrics and replace the marked region
// with the user's actual feature (list, board, table, form, chart…).
import { Card, StatCard, Button } from "@/components/ui";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-muted">Here&apos;s what&apos;s happening today.</p>
        </div>
        <Button>New item</Button>
      </div>

      {/* AI: relabel these for the app's real metrics (or remove). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value="1,248" hint="+12% this week" />
        <StatCard label="Active" value="312" hint="+4% this week" />
        <StatCard label="Pending" value="27" hint="3 need review" />
        <StatCard label="Revenue" value="$8.4k" hint="+18% this month" />
      </div>

      {/* AI: BUILD THE APP'S MAIN FEATURE HERE — replace this card's contents. */}
      <Card className="min-h-[280px]">
        <h2 className="text-lg font-semibold text-ink">Your feature goes here</h2>
        <p className="mt-1 text-sm text-muted">
          Replace this region with the core of the app. Reuse the kit in{" "}
          <code className="rounded bg-surface2 px-1 py-0.5 text-ink">components/ui.tsx</code> (Card,
          Button, Input, Field, StatCard) and the color tokens so it stays on-theme.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {["First", "Second", "Third", "Fourth"].map((row) => (
            <div key={row} className="flex items-center justify-between rounded-xl border border-line bg-bg px-4 py-3">
              <span className="text-sm text-ink">{row} example row</span>
              <span className="text-xs text-muted">placeholder</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
