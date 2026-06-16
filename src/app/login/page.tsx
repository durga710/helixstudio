import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AlertCircle, ArrowRight, GitBranch, Coins } from "lucide-react";
import { AuthError } from "next-auth";
import { auth, demoMode, oauthProviders, signIn, DEMO_USER } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { BrandMark } from "@/components/brand";

/**
 * NextAuth's server-action signIn THROWS on a bad credential (it doesn't
 * redirect with ?error). Without this, the throw escapes the action and — with
 * no error boundary — renders as a broken/not-found page. Catch AuthError and
 * bounce back to /login?error so the form shows "that didn't match"; re-throw
 * everything else (notably NEXT_REDIRECT, which performs the success redirect).
 */
async function handleSignInError(err: unknown): Promise<never> {
  if (err instanceof AuthError) redirect("/login?error=1");
  throw err;
}

export const metadata: Metadata = { title: "Sign in" };

/**
 * If the current session is a guest, remember their user id for 10 minutes so
 * the editor can transfer their workspaces onto the real account they're
 * about to sign in with. Safe: the transfer only ever moves data off
 * accounts marked isGuest. Returns true when an upgrade is in flight.
 */
async function markGuestUpgrade(): Promise<boolean> {
  const session = await auth();
  if (session?.user?.isGuest && session.user.id) {
    (await cookies()).set("helix.upgrade-from", session.user.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return true;
  }
  return false;
}

const GitHubIcon = (
  <svg viewBox="0 0 16 16" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
    <path d="M8 0a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.2.48-2.67-1.06-2.67-1.06-.36-.92-.88-1.16-.88-1.16-.72-.49.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.21 1.86.86 2.31.66.07-.52.28-.86.5-1.06-1.75-.2-3.6-.88-3.6-3.9 0-.86.31-1.56.82-2.11-.08-.2-.36-1 .08-2.09 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.01 2.2-.8 2.2-.8.44 1.09.16 1.89.08 2.09.51.55.82 1.25.82 2.11 0 3.03-1.85 3.7-3.61 3.89.29.24.54.72.54 1.45v2.15c0 .21.15.45.55.38A8 8 0 0 0 8 0z" />
  </svg>
);

const GoogleIcon = (
  <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
    <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
    <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8z" />
    <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
  </svg>
);

const oauthBtn =
  "flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-[#28364f] bg-[#0d1626] px-4 py-[11px] text-sm font-medium text-[#f8fbff] transition-colors hover:border-accent hover:bg-[#121d30]";

const fieldInput =
  "w-full rounded-[10px] border border-[#28364f] bg-[#0d1626] px-[13px] py-[11px] font-sans text-sm text-[#f8fbff] outline-none transition placeholder:text-[#5f6f86] focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; verified?: string; verifyerror?: string }>;
}) {
  const session = await auth();
  // Guests may revisit this page to upgrade to a real account.
  if (session?.user && !session.user.isGuest) redirect("/");
  const isGuest = Boolean(session?.user?.isGuest);
  const { error, reset, verified, verifyerror } = await searchParams;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#070b12] text-[#f8fbff] md:grid-cols-2">
      {/* Left: sign-in form */}
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3">
            <span className="overflow-hidden rounded-xl shadow-[0_6px_22px_rgba(0,0,0,0.5)]">
              <BrandMark size={46} />
            </span>
            <span className="leading-none">
              <div className="text-[21px] font-extrabold tracking-tight">HELIX</div>
              <div className="mt-[3px] text-[11px] font-semibold tracking-[0.34em] text-[#9cadc4]">STUDIO</div>
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-[#9cadc4]">Sign in to your Helix Studio workspace.</p>

          {(oauthProviders.github || oauthProviders.google) && (
            <>
              <div className="mt-6 flex flex-col gap-2.5">
                {oauthProviders.github && (
                  <form
                    action={async () => {
                      "use server";
                      const upgrading = await markGuestUpgrade();
                      try {
                        await signIn("github", { redirectTo: upgrading ? "/editor" : "/" });
                      } catch (err) {
                        await handleSignInError(err);
                      }
                    }}
                  >
                    <button className={oauthBtn}>{GitHubIcon}Continue with GitHub</button>
                  </form>
                )}
                {oauthProviders.google && (
                  <form
                    action={async () => {
                      "use server";
                      const upgrading = await markGuestUpgrade();
                      try {
                        await signIn("google", { redirectTo: upgrading ? "/editor" : "/" });
                      } catch (err) {
                        await handleSignInError(err);
                      }
                    }}
                  >
                    <button className={oauthBtn}>{GoogleIcon}Continue with Google</button>
                  </form>
                )}
              </div>
              <div className="my-5 flex items-center gap-3.5 text-xs text-[#5f6f86] before:h-px before:flex-1 before:bg-[#1d2940] after:h-px after:flex-1 after:bg-[#1d2940]">
                or
              </div>
            </>
          )}

          {reset && (
            <div
              role="status"
              className="mb-4 mt-5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2.5 text-xs text-accent"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              Password updated — sign in with your new password.
            </div>
          )}

          {verified && (
            <div
              role="status"
              className="mb-4 mt-5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2.5 text-xs text-accent"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              Email verified — you can sign in now.
            </div>
          )}

          {verifyerror && (
            <div
              role="alert"
              className="mb-4 mt-5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-3 py-2.5 text-xs text-[#fca5a5]"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              That verification link is invalid or expired. Sign up again or request a new link.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 mt-5 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-3 py-2.5 text-xs text-[#fca5a5]"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {demoMode
                ? "That email and password didn't match. Try the demo credentials below."
                : "That email and password didn't match. Check them and try again."}
            </div>
          )}

          <form
            className={error ? "" : "mt-6"}
            action={async (formData: FormData) => {
              "use server";
              try {
                await signIn("credentials", {
                  email: formData.get("email"),
                  password: formData.get("password"),
                  redirectTo: "/",
                });
              } catch (err) {
                await handleSignInError(err);
              }
            }}
          >
            <div className="mb-3.5">
              <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-medium text-[#9cadc4]">
                Email
              </label>
              <input id="email" name="email" type="email" required placeholder="you@company.com" autoComplete="email" className={fieldInput} />
            </div>
            <div className="mb-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-[12.5px] font-medium text-[#9cadc4]">
                  Password
                </label>
                <a href="/forgot-password" className="text-[12px] text-accent hover:underline">
                  Forgot password?
                </a>
              </div>
              <input id="password" name="password" type="password" required placeholder="••••••••" autoComplete="current-password" className={fieldInput} />
            </div>
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {demoMode && (
            <div className="mt-5 rounded-[10px] border border-[#1d2940] bg-[#0d1626] px-3.5 py-3 text-xs text-[#9cadc4]">
              Demo workspace: <span className="font-mono text-[#f8fbff]">{DEMO_USER.email}</span> ·{" "}
              <span className="font-mono text-[#f8fbff]">helix-demo</span>
            </div>
          )}

          {dbEnabled() && !isGuest && (
            <form
              action={async () => {
                "use server";
                try {
                  await signIn("guest", { redirectTo: "/editor" });
                } catch (err) {
                  await handleSignInError(err);
                }
              }}
              className="mt-4"
            >
              <button
                type="submit"
                className="w-full cursor-pointer py-2 text-xs text-[#5f6f86] transition-colors hover:text-[#9cadc4]"
              >
                Continue as guest — try the editor without an account
              </button>
            </form>
          )}

          {isGuest && (
            <div className="mt-5 rounded-[10px] border border-[#1d2940] bg-[#0d1626] px-3.5 py-3 text-xs text-[#9cadc4]">
              You&apos;re in guest mode — sign in above to keep your work and unlock GitHub import &amp; push.
            </div>
          )}

          <a
            href="/signup"
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#28364f] bg-transparent px-4 py-[11px] text-sm font-medium text-[#f8fbff] transition-colors hover:border-accent hover:bg-[#121d30]"
          >
            New here? <span className="font-semibold text-accent">Create an account</span>
            <ArrowRight className="h-3.5 w-3.5 text-accent" />
          </a>

          <div className="mt-7 text-center text-[11.5px] leading-relaxed text-[#5f6f86]">
            By continuing you agree to our Terms and Privacy Policy.
            <br />
            helixstudio.org
          </div>
        </div>
      </div>

      {/* Right: brand aside */}
      <div className="relative hidden flex-col justify-center overflow-hidden border-l border-[#1d2940] bg-[radial-gradient(700px_500px_at_70%_20%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent),radial-gradient(600px_400px_at_30%_90%,color-mix(in_srgb,#c084fc_14%,transparent),transparent),#0d1626] p-[60px] md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_200px_at_50%_0,color-mix(in_srgb,#00ffd1_8%,transparent),transparent)]" />
        <div className="relative max-w-[440px]">
          <div className="text-[26px] font-bold leading-[1.3] tracking-tight">
            From idea to production,{" "}
            <span className="bg-gradient-to-r from-[#00ffd1] via-[55%] via-accent to-[#c084fc] bg-clip-text text-transparent">
              reviewed by five agents
            </span>{" "}
            before it ships.
          </div>
          <div className="mt-4 text-sm text-[#9cadc4]">The AI coding platform built for people who ship.</div>

          {/* Bring any model — and pay less per build. Truth-gated: every claim is
              a real engine (0-token scaffolds/narration/intake, compact context,
              rolling compaction) — see build-feed.ts / chat-context.ts. */}
          <div className="mt-8 rounded-2xl border border-[#28364f] bg-[color-mix(in_srgb,#0d1626_55%,transparent)] p-[18px]">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#f8fbff]">
              <Coins className="h-4 w-4 text-accent" />
              Bring any model — pay less per build
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#9cadc4]">
              Run OpenAI, Claude, Gemini — or your own key. Our context engine, 0-token starters, and
              rolling compaction cut the tokens every build spends, so the same model costs you less.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["OpenAI", "Claude", "Gemini", "Your own key"].map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-[#28364f] bg-[#0d1626] px-2.5 py-1 text-[11px] font-medium text-[#9cadc4]"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Git integrations — all 5 are real (src/lib/git/meta.ts): import + push. */}
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9cadc4]">
              <GitBranch className="h-3.5 w-3.5 text-accent" />
              Import &amp; push to your repos
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {[
                { label: "GitHub", icon: GitHubIcon },
                { label: "GitLab", icon: null },
                { label: "Bitbucket", icon: null },
                { label: "Azure DevOps", icon: null },
                { label: "Gitea", icon: null },
              ].map((g) => (
                <span
                  key={g.label}
                  className="flex items-center gap-1.5 rounded-full border border-[#28364f] bg-[color-mix(in_srgb,#0d1626_60%,transparent)] px-3 py-1.5 text-xs text-[#cdd8e8]"
                >
                  {g.icon ? <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{g.icon}</span> : null}
                  {g.label}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 flex gap-[30px]">
            {[
              { n: "5", l: "git integrations" },
              { n: "5", l: "review agents" },
              { n: "1", l: "unified workspace" },
            ].map((stat) => (
              <div key={stat.l}>
                <div className="text-2xl font-bold">{stat.n}</div>
                <div className="text-xs text-[#5f6f86]">{stat.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
