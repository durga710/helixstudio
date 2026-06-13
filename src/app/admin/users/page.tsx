/**
 * /admin/users — searchable user list for admins: tier, usage (month +
 * lifetime), limits, status. Each row links to the per-user detail page.
 * Same 404 posture as /admin for non-admins.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, dbEnabled } from "@/lib/db";
import { estimateCostUsd, TIER_TOKEN_LIMITS, type UserTier } from "@/lib/agent-config";
import { AdminAutoRefresh } from "../auto-refresh";
import { fmt, usd } from "../ui";

export const metadata = { title: "Helix · Admin · Users", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type Sort = "tokens" | "month" | "recent";

async function loadUsers(q: string, sort: Sort) {
  return db().user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy:
      sort === "recent" ? { createdAt: "desc" } : sort === "month" ? { periodTokens: "desc" } : { tokensUsed: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      email: true,
      name: true,
      isGuest: true,
      tier: true,
      tokensUsed: true,
      periodTokens: true,
      tokenLimit: true,
      suspendedAt: true,
      createdAt: true,
      _count: { select: { workspaces: true } },
    },
  });
}

function limitLabel(u: { isGuest: boolean; tier: string; tokenLimit: number | null }): string {
  if (u.tokenLimit !== null) return `${fmt(u.tokenLimit)} (admin)`;
  if (u.isGuest) return "guest default";
  const t = TIER_TOKEN_LIMITS[u.tier as UserTier];
  return t === null || t === undefined ? "unlimited" : `${fmt(t)} (tier)`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort: Sort = sp.sort === "recent" ? "recent" : sp.sort === "month" ? "month" : "tokens";
  const users = dbEnabled() ? await loadUsers(q, sort) : null;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-txt">
            <Link href="/admin" className="text-txt3 hover:text-txt">
              Admin
            </Link>{" "}
            / Users
          </h1>
          <AdminAutoRefresh intervalMs={30_000} />
        </div>
        <p className="mt-1 text-[13px] text-txt3">
          Every account, its AI spend and limits. Click a user to inspect and override.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search email or name…"
            className="w-64 rounded-lg border border-border bg-panel px-3 py-1.5 text-[13px] text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
          />
          {sort !== "tokens" && <input type="hidden" name="sort" value={sort} />}
          <button
            type="submit"
            className="rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt"
          >
            Search
          </button>
        </form>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-txt3">Sort:</span>
          {(
            [
              ["tokens", "lifetime tokens"],
              ["month", "this month"],
              ["recent", "newest"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(key !== "tokens" ? { sort: key } : {}) })}`}
              className={
                sort === key ? "font-semibold text-accent" : "text-txt2 hover:text-txt"
              }
            >
              {label}
            </Link>
          ))}
          <a
            href="/api/admin/usage/export"
            className="ml-3 rounded-lg border border-border2 bg-panel2 px-3 py-1.5 font-medium text-txt2 hover:border-accent hover:text-txt"
          >
            Export usage CSV
          </a>
        </div>
      </div>

      {!users ? (
        <p className="text-[13px] text-txt3">No database configured — user management unavailable (demo mode).</p>
      ) : (
        <div className="overflow-x-auto rounded-card-lg border border-border bg-panel">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[10px]">
                <th className="label-tactical px-4 py-2.5">User</th>
                <th className="label-tactical px-4 py-2.5">Tier</th>
                <th className="label-tactical px-4 py-2.5">This month</th>
                <th className="label-tactical px-4 py-2.5">Lifetime</th>
                <th className="label-tactical px-4 py-2.5">Limit</th>
                <th className="label-tactical px-4 py-2.5">Workspaces</th>
                <th className="label-tactical px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-txt3">
                    No users match{q ? ` “${q}”` : ""}.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-panel2/50">
                  <td className="px-4 py-2">
                    <Link href={`/admin/users/${u.id}`} className="block">
                      <span className={u.suspendedAt ? "text-warn" : "text-txt"}>
                        {u.email ?? u.name ?? u.id.slice(0, 10)}
                      </span>
                      {u.name && u.email && <span className="ml-2 text-txt3">{u.name}</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11.5px] text-txt2">{u.isGuest ? "guest" : u.tier}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px] text-txt2">{fmt(u.periodTokens)}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px] text-txt2">
                    {fmt(u.tokensUsed)} <span className="text-txt3">· {usd(estimateCostUsd(u.tokensUsed))}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11.5px] text-txt2">{limitLabel(u)}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px] text-txt2">{u._count.workspaces}</td>
                  <td className="px-4 py-2">
                    {u.suspendedAt ? (
                      <span className="font-semibold text-warn">SUSPENDED</span>
                    ) : (
                      <span className="text-ok">active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-txt3">
        Showing up to {PAGE_SIZE} users{q ? ` matching “${q}”` : ""} — refine with search. “This month” counters reset
        lazily when a user is next active after the UTC month rolls over.
      </p>
    </div>
  );
}
