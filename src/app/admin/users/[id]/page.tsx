/**
 * /admin/users/[id] — everything about one user: profile, AI config (key
 * booleans only — key values never leave the server), usage stats, workspaces,
 * spaces, recent per-call usage history, and the admin override actions
 * (tier, token limit, reset counters, suspend).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { userUsageAnomaly } from "@/lib/security/usage-anomaly";
import { db, dbEnabled } from "@/lib/db";
import { estimateCostUsd } from "@/lib/agent-config";
import { effectiveLimit } from "@/lib/token-budget";
import { AdminAutoRefresh } from "../../auto-refresh";
import { Stat, Row, fmt, usd } from "../../ui";
import { UserActions } from "./user-actions";

export const metadata = { title: "Helix · Admin · User", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Computed in a module-scope helper, not inline in the (server) component:
// the react-hooks/purity lint rule can't tell server components from client
// ones and flags a bare `Date.now()` in render. This page is force-dynamic,
// so it's evaluated per request — the timestamp is correct.
function last30dCutoff() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();
  const { id } = await params;
  if (!dbEnabled()) notFound();

  const user = await db().user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      isGuest: true,
      createdAt: true,
      tier: true,
      tokensUsed: true,
      periodTokens: true,
      periodStart: true,
      tokenLimit: true,
      suspendedAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      currentPeriodEnd: true,
    },
  });
  if (!user) notFound();

  const [prefs, workspaces, ownedSpaces, memberships, messageCount, events, monthAgg] = await Promise.all([
    db().userPreferences.findUnique({
      where: { userId: id },
      select: { aiProvider: true, aiModel: true, openaiKey: true, anthropicKey: true, localKey: true },
    }),
    db().workspace.findMany({
      where: { userId: id },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        mode: true,
        provider: true,
        repo: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    db().space.findMany({
      where: { ownerId: id },
      select: { id: true, name: true, kind: true, plan: true, seats: true },
    }),
    db().spaceMember.findMany({
      where: { userId: id },
      select: { space: { select: { id: true, name: true, kind: true } } },
    }),
    db().workspaceMessage.count({ where: { workspace: { userId: id } } }),
    db().aiUsageEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        provider: true,
        model: true,
        tokens: true,
        createdAt: true,
        workspace: { select: { name: true } },
        workspaceId: true,
      },
    }),
    db().aiUsageEvent.aggregate({
      where: { userId: id, createdAt: { gte: last30dCutoff() } },
      _sum: { tokens: true },
    }),
  ]);

  // Statistical outlier check on this user's recent hourly token spend.
  const anomaly = await userUsageAnomaly(id);

  const limit = effectiveLimit(user);
  const used = user.isGuest ? user.tokensUsed : user.periodTokens;
  const last30d = monthAgg._sum.tokens ?? 0;
  const keys = {
    openai: Boolean(prefs?.openaiKey),
    anthropic: Boolean(prefs?.anthropicKey),
    local: Boolean(prefs?.localKey),
  };

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-h1">
            <Link href="/admin" className="text-txt3 hover:text-txt">
              Admin
            </Link>{" "}
            /{" "}
            <Link href="/admin/users" className="text-txt3 hover:text-txt">
              Users
            </Link>{" "}
            / <span className="font-mono text-[20px]">{user.email ?? user.name ?? user.id.slice(0, 10)}</span>
            {user.isGuest && <span className="ml-2 text-[13px] font-normal text-txt3">(guest)</span>}
            {user.suspendedAt && (
              <span className="ml-2 align-middle text-[12px] font-semibold text-warn">SUSPENDED</span>
            )}
          </h1>
          <AdminAutoRefresh intervalMs={30_000} />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Tokens (lifetime)"
          value={fmt(user.tokensUsed)}
          sub={`≈ ${usd(estimateCostUsd(user.tokensUsed))} est.`}
        />
        <Stat label="Last 30 days" value={fmt(last30d)} sub={`≈ ${usd(estimateCostUsd(last30d))} est.`} />
        <Stat
          label={user.isGuest ? "Guest allowance" : "Monthly quota"}
          value={limit === null ? "unlimited" : `${fmt(used)} / ${fmt(limit)}`}
          sub={
            user.tokenLimit !== null
              ? "admin override"
              : user.isGuest
                ? "lifetime"
                : `${user.tier} tier · month of ${user.periodStart.toISOString().slice(0, 7)}`
          }
        />
        <Stat label="Workspaces" value={fmt(workspaces.length)} sub={`${fmt(messageCount)} chat messages`} />
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-card-lg border border-border2 bg-panel lit p-4">
          <h2 className="text-h3 mb-2">Profile</h2>
          <Row k="Email" v={user.email ?? "—"} />
          <Row k="Name" v={user.name ?? "—"} />
          <Row k="Joined" v={user.createdAt.toISOString().slice(0, 10)} />
          <Row k="Account type" v={user.isGuest ? "guest" : "member"} />
          <Row k="Tier" v={user.tier} />
          <Row
            k="Stripe"
            v={
              user.stripeSubscriptionId
                ? `subscribed${user.currentPeriodEnd ? ` · renews ${user.currentPeriodEnd.toISOString().slice(0, 10)}` : ""}`
                : user.stripeCustomerId
                  ? "customer (no active sub)"
                  : "—"
            }
          />
          <h2 className="text-h3 mb-2 mt-5">AI config</h2>
          <Row k="Provider / model" v={`${prefs?.aiProvider ?? "openai"} / ${prefs?.aiModel || "default"}`} />
          <Row
            k="Own API keys"
            v={`openai ${keys.openai ? "✓" : "—"} · anthropic ${keys.anthropic ? "✓" : "—"} · local ${keys.local ? "✓" : "—"}`}
          />
        </div>

        <UserActions
          userId={user.id}
          isSelf={user.id === session?.user?.id}
          isGuest={user.isGuest}
          tier={user.tier}
          tokenLimit={user.tokenLimit}
          suspended={Boolean(user.suspendedAt)}
          usedThisPeriod={used}
        />
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-card-lg border border-border2 bg-panel lit p-4">
          <h2 className="text-h3 mb-2">Workspaces ({workspaces.length})</h2>
          {workspaces.length === 0 ? (
            <p className="text-[12px] text-txt3">None.</p>
          ) : (
            workspaces.map((w) => (
              <Row
                key={w.id}
                k={`${w.name}${w.repo ? ` · ${w.repo}` : ""}`}
                v={`${w.mode.toLowerCase()} · ${w._count.messages} msgs · ${w.updatedAt.toISOString().slice(0, 10)}`}
              />
            ))
          )}
        </div>
        <div className="rounded-card-lg border border-border2 bg-panel lit p-4">
          <h2 className="text-h3 mb-2">
            Spaces ({ownedSpaces.length + memberships.length})
          </h2>
          {ownedSpaces.length === 0 && memberships.length === 0 ? (
            <p className="text-[12px] text-txt3">None.</p>
          ) : (
            <>
              {ownedSpaces.map((s) => (
                <Row key={s.id} k={`${s.name} (owner)`} v={`${s.kind} · ${s.plan} · ${s.seats} seats`} />
              ))}
              {memberships.map((m) => (
                <Row key={m.space.id} k={m.space.name} v={`${m.space.kind} · member`} />
              ))}
            </>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-h3">Recent AI usage (last {events.length})</h2>
            {anomaly.anomalous && (
              <span
                title={anomaly.reason}
                className="rounded-full border border-[color-mix(in_srgb,var(--red)_45%,transparent)] bg-[color-mix(in_srgb,var(--red)_12%,transparent)] px-2 py-0.5 text-[11px] font-medium text-bad"
              >
                ⚠ unusual spend ({anomaly.z}σ)
              </span>
            )}
          </div>
          <a
            href={`/api/admin/usage/export?userId=${user.id}`}
            className="rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt"
          >
            Download CSV
          </a>
        </div>
        <div className="overflow-x-auto rounded-card-lg border border-border2 bg-panel lit">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px]">
                <th className="label-tactical px-4 py-2.5">When</th>
                <th className="label-tactical px-4 py-2.5">Kind</th>
                <th className="label-tactical px-4 py-2.5">Provider / model</th>
                <th className="label-tactical px-4 py-2.5">Workspace</th>
                <th className="label-tactical px-4 py-2.5">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-txt3">
                    No recorded calls yet (history starts with this feature; lifetime totals above are complete).
                  </td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5 font-mono text-[11px] text-txt2">
                    {e.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  </td>
                  <td className="px-4 py-1.5 text-txt2">{e.kind}</td>
                  <td className="px-4 py-1.5 font-mono text-[11px] text-txt2">
                    {e.provider || "—"} / {e.model || "—"}
                  </td>
                  <td className="px-4 py-1.5 text-txt2">
                    {e.workspace?.name ?? (e.workspaceId ? "(deleted)" : "—")}
                  </td>
                  <td className="px-4 py-1.5 font-mono text-[11px] text-txt">{fmt(e.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
