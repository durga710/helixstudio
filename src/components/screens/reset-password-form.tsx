"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

const fieldInput =
  "w-full rounded-[10px] border border-[#28364f] bg-[#0d1626] px-[13px] py-[11px] font-sans text-sm text-[#f8fbff] outline-none transition placeholder:text-[#5f6f86] focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't reset your password.");
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset your password.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mt-6 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-4 py-3.5 text-sm text-[#fca5a5]">
        This reset link is missing its token. Request a new one from{" "}
        <a href="/forgot-password" className="font-medium underline">
          forgot password
        </a>
        .
      </div>
    );
  }

  return (
    <form className="mt-6" onSubmit={submit}>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-3 py-2.5 text-xs text-[#fca5a5]"
        >
          {error}
        </div>
      )}
      <div className="mb-3.5">
        <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
          New password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          className={fieldInput}
        />
      </div>
      <div className="mb-5">
        <label htmlFor="confirm" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          className={fieldInput}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Updating…" : "Update password"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
