"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

/** Yes/No for an invite. Join POSTs to /api/spaces/join (idempotent, seat-
 * gated server-side); Not now returns to the Spaces home without joining. */
export function JoinButtons({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spaces/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        router.push(`/space?s=${json.data.id}`);
      } else {
        setError(json?.error?.message ?? "Couldn't join this team. The invite may have expired.");
        setBusy(false);
      }
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => void join()}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Yes, join
        </button>
        <button
          type="button"
          onClick={() => router.push("/space")}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border2 bg-panel px-4 py-2.5 text-sm font-medium text-txt2 transition hover:border-accent hover:text-txt disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          Not now
        </button>
      </div>
      {error && <p className="mt-3 text-center text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
