"use client";

// Login / signup — mock auth (writes a localStorage session, then → /dashboard).
// Replace signIn() in lib/auth.ts with a real provider when ready; this page's
// markup can stay.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { Card, Field, Input, Button } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !password.trim() || (mode === "signup" && !name.trim())) {
      setError("Please fill in every field.");
      return;
    }
    const displayName = mode === "signup" ? name.trim() : email.split("@")[0];
    signIn({ name: displayName, email: email.trim() });
    router.replace("/dashboard");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-fg font-bold">
            {APP_NAME.charAt(0).toUpperCase()}
          </span>
          <span className="text-lg font-semibold text-ink">{APP_NAME}</span>
        </div>
        <Card>
          <h1 className="text-xl font-semibold text-ink">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login" ? "Welcome back." : "Start in seconds — no setup needed."}
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === "signup" ? (
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
              </Field>
            ) : null}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            {error ? <p className="text-sm text-accent">{error}</p> : null}
            <Button type="submit" className="w-full">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
              className="font-medium text-brand hover:underline"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </Card>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/" className="hover:text-ink">
            ← Back home
          </Link>
        </p>
      </div>
    </div>
  );
}
