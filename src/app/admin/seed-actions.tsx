"use client";

/**
 * Admin control to seed / wipe the @seed.helix.test test accounts. POSTs the
 * seed endpoint and shows the returned login credentials + row counts so the
 * admin can immediately sign in as the test user. Mirrors the fetch/busy/error
 * idiom from user-actions.tsx.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SeedSummary {
  testUser: { email: string; password: string };
  counts: Record<string, number>;
}

const btn =
  "rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt disabled:cursor-not-allowed disabled:opacity-50";

export function SeedActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<SeedSummary | null>(null);

  async function run(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/seed-test-data", { method });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Request failed.");
      } else if (method === "POST") {
        setResult(json.data as SeedSummary);
        setNote("Test data seeded.");
        router.refresh();
      } else {
        setResult(null);
        setNote(`Wiped ${json.data?.deletedUsers ?? 0} seed user(s).`);
        router.refresh();
      }
    } catch {
      setError("Network error.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-card-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => run("POST")} className={btn}>
          {busy ? "Working…" : "Seed / Reset test data"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Delete all @seed.helix.test accounts and their data?")) void run("DELETE");
          }}
          className={btn}
        >
          Wipe test data
        </button>
      </div>

      <p className="mt-2 text-[11px] text-txt3">
        Seeds real DB rows under the <code>@seed.helix.test</code> accounts (a test user, a teammate, and 3 students)
        so every page shows believable data. Idempotent — re-running resets cleanly. Real accounts are never touched.
      </p>

      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
      {note && <p className="mt-2 text-[12px] text-ok">{note}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-border bg-bg2 p-3">
          <div className="text-[12px] text-txt2">
            Sign in as the test user:
            <div className="mt-1 font-mono text-[12px] text-txt">
              {result.testUser.email} · {result.testUser.password}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {Object.entries(result.counts).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[11.5px]">
                <span className="text-txt3">{k}</span>
                <span className="font-mono text-txt2">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
