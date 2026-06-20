"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, MailCheck } from "lucide-react";
import { TurnstileWidget, captchaSiteKey } from "@/components/screens/turnstile-widget";

const fieldInput =
  "w-full rounded-[10px] border border-[#28364f] bg-[#0d1626] px-[13px] py-[11px] font-sans text-sm text-[#f8fbff] outline-none transition placeholder:text-[#5f6f86] focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (captchaSiteKey && !captchaToken) {
      setError("Please complete the human check.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, turnstileToken: captchaToken || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; verify?: boolean } | null;
      if (!res.ok) throw new Error(body?.error ?? "Sign-up failed");
      // Email verification required → don't sign in; tell them to confirm first.
      if (body?.verify) {
        setVerifySent(true);
        return;
      }
      // Otherwise account is active — sign straight in.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        // The account exists; auto-sign-in just didn't take. Send them to the
        // login page to sign in (don't strand them on a failure-looking screen).
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setBusy(false);
    }
  }

  if (verifySent) {
    return (
      <div className="mt-6 rounded-[10px] border border-[#28364f] bg-[#0d1626] px-4 py-4 text-sm text-[#9cadc4]">
        <div className="flex items-center gap-2 font-medium text-[#f8fbff]">
          <MailCheck className="h-4 w-4 text-accent" /> Confirm your email
        </div>
        <p className="mt-1.5 leading-relaxed">
          We sent a verification link to <span className="text-[#f8fbff]">{email}</span>. Click it to
          activate your account, then sign in. The link expires in 24 hours.
        </p>
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
        <label htmlFor="name" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
          Name
        </label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ada Lovelace" autoComplete="name" className={fieldInput} />
      </div>
      <div className="mb-3.5">
        <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
          Email
        </label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" className={fieldInput} />
      </div>
      <div className="mb-5">
        <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
          Password
        </label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password" className={fieldInput} />
      </div>
      <TurnstileWidget onToken={setCaptchaToken} />
      <button
        type="submit"
        disabled={busy || (Boolean(captchaSiteKey) && !captchaToken)}
        className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create account"}
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
