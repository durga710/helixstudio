"use client";

import { useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";

const fieldInput =
  "w-full rounded-[10px] border border-[#28364f] bg-[#0d1626] px-[13px] py-[11px] font-sans text-sm text-[#f8fbff] outline-none transition placeholder:text-[#5f6f86] focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; devLink?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
      setDevLink(body?.devLink ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-[10px] border border-[#28364f] bg-[#0d1626] px-4 py-4 text-sm text-[#9cadc4]">
        <div className="flex items-center gap-2 font-medium text-[#f8fbff]">
          <MailCheck className="h-4 w-4 text-accent" /> Check your inbox
        </div>
        <p className="mt-1.5 leading-relaxed">
          If an account exists for <span className="text-[#f8fbff]">{email}</span>, we&apos;ve sent a
          link to reset your password. It expires in 1 hour.
        </p>
        {devLink && (
          <p className="mt-3 break-all text-[11px] text-[#5f6f86]">
            Dev mode (no email provider) — use this link:{" "}
            <a href={devLink} className="text-accent hover:underline">
              {devLink}
            </a>
          </p>
        )}
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
      <div className="mb-5">
        <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@company.com"
          autoComplete="email"
          className={fieldInput}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send reset link"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
