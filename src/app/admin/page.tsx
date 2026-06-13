import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, GUEST_TOKEN_LIMIT } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, dbEnabled } from "@/lib/db";
import {
  AGENT_LIMITS,
  PROMPT_REGISTRY,
  VERIFY_DEFAULT_ON,
  VERIFY_MAX_FIX_ATTEMPTS,
  TOKEN_COST_PER_MILLION_USD,
  TIER_TOKEN_LIMITS,
  estimateCostUsd,
} from "@/lib/agent-config";
import { WORKSPACE_TOOLS } from "@/lib/workspace-tools";
import { PROVIDER_DEFAULT_MODEL } from "@/lib/ai-agent";
import { OPENAI_MODEL } from "@/lib/openai";
import { AdminAutoRefresh } from "./auto-refresh";
import { SeedActions } from "./seed-actions";
import { TemplateRefresh } from "./template-refresh";
import { Stat, Row, fmt, usd } from "./ui";

export const metadata = { title: "Helix · Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function loadStats() {
  if (!dbEnabled()) return null;
  const [users, guests, workspaces, files, messages, intents, tokenAgg, topUsers, limited, suspended] =
    await Promise.all([
      db().user.count(),
      db().user.count({ where: { isGuest: true } }),
      db().workspace.count(),
      db().workspaceFile.count(),
      db().workspaceMessage.count(),
      db().workspaceIntent.count().catch(() => 0),
      db().user.aggregate({ _sum: { tokensUsed: true } }),
      db().user.findMany({
        orderBy: { tokensUsed: "desc" },
        take: 8,
        select: { id: true, email: true, name: true, isGuest: true, tokensUsed: true },
      }),
      db().user.count({ where: { tokenLimit: { not: null } } }).catch(() => 0),
      db().user.count({ where: { suspendedAt: { not: null } } }).catch(() => 0),
    ]);
  return {
    users,
    guests,
    workspaces,
    files,
    messages,
    intents,
    totalTokens: tokenAgg._sum.tokensUsed ?? 0,
    topUsers,
    limited,
    suspended,
  };
}

export default async function AdminPage() {
  const session = await auth();
  // 404 for anyone who isn't an admin — the page simply doesn't exist to them.
  if (!isAdminEmail(session?.user?.email)) notFound();

  const stats = await loadStats();
  const toolList = WORKSPACE_TOOLS.map((t) =>
    t.type === "web_search"
      ? { name: "web_search", description: "Built-in web search (OpenAI provider only)." }
      : { name: (t as { name: string }).name, description: (t as { description: string }).description },
  );

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-txt">Helix · Admin overview</h1>
          <AdminAutoRefresh intervalMs={30_000} />
        </div>
        <p className="mt-1 text-[13px] text-txt3">
          System internals — agent move logic, prompts, AI usage, and configuration. Signed in as{" "}
          <span className="font-mono text-txt2">{session?.user?.email}</span>. Not linked from the app.
        </p>
      </header>

      {/* Usage */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-txt">AI usage &amp; cost</h2>
        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Tokens (all time)"
                value={fmt(stats.totalTokens)}
                sub={`≈ ${usd(estimateCostUsd(stats.totalTokens))} est.`}
              />
              <Stat label="Users" value={fmt(stats.users)} sub={`${fmt(stats.guests)} guests`} />
              <Stat label="Workspaces" value={fmt(stats.workspaces)} sub={`${fmt(stats.files)} files`} />
              <Stat label="Chat messages" value={fmt(stats.messages)} sub={`${fmt(stats.intents)} ledger intents`} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-card-lg border border-border bg-panel p-4">
                <div className="label-tactical mb-2 text-[10px]">Top token users</div>
                {stats.topUsers.length === 0 ? (
                  <p className="text-[12px] text-txt3">No usage yet.</p>
                ) : (
                  stats.topUsers.map((u) => (
                    <Row
                      key={u.id}
                      k={
                        <Link href={`/admin/users/${u.id}`} className="hover:text-accent hover:underline">
                          {u.name ?? u.email ?? "—"}
                          {u.isGuest ? " (guest)" : ""}
                        </Link>
                      }
                      v={`${fmt(u.tokensUsed)} · ${usd(estimateCostUsd(u.tokensUsed))}`}
                    />
                  ))
                )}
                <p className="mt-2 text-[11px] text-txt3">
                  Cost is an estimate at {usd(TOKEN_COST_PER_MILLION_USD)}/1M blended tokens — not billing.
                </p>
              </div>
              <div className="rounded-card-lg border border-border bg-panel p-4">
                <div className="label-tactical mb-2 text-[10px]">User management</div>
                <Row k="Total users" v={fmt(stats.users)} />
                <Row k="Custom token limits" v={fmt(stats.limited)} />
                <Row k="Suspended" v={fmt(stats.suspended)} />
                <Link
                  href="/admin/users"
                  className="mt-3 inline-block rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt"
                >
                  Open user management →
                </Link>
                <p className="mt-2 text-[11px] text-txt3">
                  Inspect any user&apos;s usage, set per-user token limits, change tiers, suspend accounts.
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-txt3">No database configured — usage stats unavailable (demo mode).</p>
        )}
      </section>

      {/* Test data */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-txt">Test data</h2>
        <SeedActions />
      </section>

      {/* Template builder (the refresh batch job) */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-txt">MVC template builder</h2>
        <TemplateRefresh />
      </section>

      {/* Move logic */}
      <section className="mb-8 grid gap-3 md:grid-cols-2">
        <div className="rounded-card-lg border border-border bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-txt">Agent move logic</h2>
          <Row k="Max moves per turn (hops)" v={fmt(AGENT_LIMITS.maxHops)} />
          <Row k="Token ceiling per turn" v={fmt(AGENT_LIMITS.maxTurnTokens)} />
          <Row k="read_file cap (chars)" v={fmt(AGENT_LIMITS.readCap)} />
          <Row k="tool-result cap (chars)" v={fmt(AGENT_LIMITS.toolResultCap)} />
          <Row k="search: files / matches" v={`${AGENT_LIMITS.searchFileCap} / ${AGENT_LIMITS.searchMatchCap}`} />
          <Row k="Auto-verify default" v={VERIFY_DEFAULT_ON ? "ON" : "off"} />
          <Row k="Verify fix attempts" v={fmt(VERIFY_MAX_FIX_ATTEMPTS)} />
          <p className="mt-2 text-[11px] text-txt3">
            A turn stops at whichever comes first — the move cap or the token ceiling. Cutting by spend means a cheap
            search doesn&apos;t cost the same as reading a huge file.
          </p>
        </div>
        <div className="rounded-card-lg border border-border bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-txt">Models &amp; config</h2>
          <Row k="OpenAI default model" v={OPENAI_MODEL} />
          <Row k="Anthropic default" v={PROVIDER_DEFAULT_MODEL.anthropic} />
          <Row k="Local default" v={PROVIDER_DEFAULT_MODEL.local} />
          <Row k="Guest token limit" v={`${fmt(GUEST_TOKEN_LIMIT)} (lifetime)`} />
          <Row k="Free tier quota" v={`${fmt(TIER_TOKEN_LIMITS.free ?? 0)} / month`} />
          <Row k="Pro tier quota" v={`${fmt(TIER_TOKEN_LIMITS.pro ?? 0)} / month`} />
          <Row
            k="Team tier quota"
            v={TIER_TOKEN_LIMITS.team === null ? "unlimited" : `${fmt(TIER_TOKEN_LIMITS.team)} / month`}
          />
          <Row k="Repo-tree cache TTL" v="60s (L1+L2 Redis)" />
          <Row k="Git-auth cache TTL" v="60s (L1 only)" />
          <Row k="Chat rate limit" v="100 / hour / workspace" />
        </div>
      </section>

      {/* Tools */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-txt">Agent tools ({toolList.length})</h2>
        <div className="rounded-card-lg border border-border bg-panel p-4">
          {toolList.map((t) => (
            <div key={t.name} className="border-b border-border/60 py-2 last:border-0">
              <code className="text-[12px] font-semibold text-accent">{t.name}</code>
              <p className="mt-0.5 text-[12px] leading-relaxed text-txt2">{t.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Prompts */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-txt">System prompts</h2>
        <div className="space-y-2">
          {PROMPT_REGISTRY.map((p) => (
            <details key={p.id} className="rounded-card-lg border border-border bg-panel p-4">
              <summary className="cursor-pointer select-none text-[13px] font-medium text-txt">
                {p.title} <span className="ml-2 font-mono text-[11px] text-txt3">{p.where}</span>
              </summary>
              <pre className="scroll-area mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg2 p-3 font-mono text-[11px] leading-relaxed text-txt2">
                {p.text}
              </pre>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-10 text-[11px] text-txt3">
        Access is controlled by the <code>ADMIN_EMAILS</code> env var (comma-separated). Roadmap: durable background
        jobs (stage 4) and multi-agent orchestration (stage 5) — see <code>agent-config.ts</code>.
      </footer>
    </div>
  );
}
