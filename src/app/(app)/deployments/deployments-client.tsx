"use client";

/**
 * Interactive deployments view over the real WorkspaceDeploy rows: a summary
 * header, provider/state filters, text search, sort, group-by-workspace, and
 * a live "Refresh status" button (re-polls the platform; rows it can't reach
 * are reported as skipped). All filtering/sorting is pure over the rows the
 * server passed in.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";

export const STATE_TONE: Record<string, "green" | "accent" | "red" | "neutral"> = {
  READY: "green",
  BUILDING: "accent",
  QUEUED: "accent",
  ERROR: "red",
  CANCELED: "neutral",
  UNKNOWN: "neutral",
};

export interface DeployRow {
  id: string;
  provider: string;
  projectName: string;
  productionUrl: string | null;
  dashboardUrl: string | null;
  lastState: string | null;
  lastDeployAt: string | null; // ISO
  createdAt: string; // ISO
  workspace: { id: string; name: string };
}

export interface DeploySummary {
  total: number;
  ready: number;
  building: number;
  error: number;
  projects: number;
  providers: number;
}

const ALL_STATES = ["READY", "BUILDING", "QUEUED", "ERROR", "CANCELED", "UNKNOWN"];

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-card-lg border border-border2 bg-panel px-3.5 py-2.5 lit hover-lift">
      <div className={`text-[18px] font-bold tabular-nums ${tone ?? "text-txt"}`}>{value}</div>
      <div className="text-[11px] text-txt3">{label}</div>
    </div>
  );
}

function DeployRowView({ row }: { row: DeployRow }) {
  const state = row.lastState ?? "UNKNOWN";
  const tone = STATE_TONE[state] ?? "neutral";
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          {row.workspace.name}
          <span className="font-normal text-txt3">·</span>
          <span className="font-mono text-[12px] text-txt2">{row.projectName}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[11.5px] capitalize text-txt3">{row.provider}</span>
          {row.productionUrl && (
            <>
              <span className="text-txt3">·</span>
              <a
                href={row.productionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11.5px] text-accent hover:underline"
              >
                {row.productionUrl.replace(/^https?:\/\//, "").slice(0, 40)}
                <ExternalLink className="h-[11px] w-[11px]" strokeWidth={1.7} />
              </a>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Pill tone={tone} className="capitalize">
          {state.toLowerCase()}
        </Pill>
        {row.lastDeployAt && <span className="text-[11.5px] text-txt3">{timeAgo(row.lastDeployAt)}</span>}
        {row.dashboardUrl && (
          <a
            href={row.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-7 w-7 place-items-center rounded-md border border-border2 bg-panel2 text-txt3 hover:text-txt"
            title="View in platform dashboard"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
          </a>
        )}
      </div>
    </div>
  );
}

const selectCls =
  "rounded-lg border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 focus:border-accent focus:outline-none";

export function DeploymentsClient({ rows, summary }: { rows: DeployRow[]; summary: DeploySummary }) {
  const router = useRouter();
  const [provider, setProvider] = useState("all");
  const [state, setState] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "state">("recent");
  const [grouped, setGrouped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const providers = useMemo(() => Array.from(new Set(rows.map((r) => r.provider))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (provider !== "all" && r.provider !== provider) return false;
      if (state !== "all" && (r.lastState ?? "UNKNOWN") !== state) return false;
      if (q && !r.workspace.name.toLowerCase().includes(q) && !r.projectName.toLowerCase().includes(q)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.workspace.name.localeCompare(b.workspace.name);
      if (sort === "state") return (a.lastState ?? "UNKNOWN").localeCompare(b.lastState ?? "UNKNOWN");
      // recent: lastDeployAt desc, nulls last
      const at = a.lastDeployAt ? Date.parse(a.lastDeployAt) : 0;
      const bt = b.lastDeployAt ? Date.parse(b.lastDeployAt) : 0;
      return bt - at;
    });
    return out;
  }, [rows, provider, state, query, sort]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, DeployRow[]>();
    for (const r of filtered) {
      const arr = map.get(r.workspace.name) ?? [];
      arr.push(r);
      map.set(r.workspace.name, arr);
    }
    return Array.from(map.entries());
  }, [filtered, grouped]);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/deployments/refresh", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNote(json?.error?.message ?? "Refresh failed.");
      } else {
        const { updated, skipped } = json.data as { updated: number; skipped: number };
        setNote(`Updated ${updated} · skipped ${skipped}${skipped ? " (no live connection)" : ""}`);
        router.refresh();
      }
    } catch {
      setNote("Network error.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Total" value={summary.total} />
        <Stat label="Ready" value={summary.ready} tone="text-ok" />
        <Stat label="Building" value={summary.building} tone="text-accent" />
        <Stat label="Errored" value={summary.error} tone={summary.error ? "text-bad" : "text-txt"} />
        <Stat label="Projects" value={summary.projects} />
        <Stat label="Providers" value={summary.providers} />
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspace or project…"
          className="min-w-[180px] flex-1 rounded-lg border border-border2 bg-panel px-3 py-1.5 text-[12px] text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
        />
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={selectCls} aria-label="Provider">
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} className={selectCls} aria-label="State">
          <option value="all">All states</option>
          {ALL_STATES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectCls} aria-label="Sort">
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="state">State</option>
        </select>
        <button
          type="button"
          onClick={() => setGrouped((g) => !g)}
          className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${grouped ? "border-accent bg-accent/10 text-accent" : "border-border2 bg-panel text-txt2 hover:text-txt"}`}
        >
          Group
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] font-medium text-txt2 hover:border-accent hover:text-txt disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} strokeWidth={1.7} />
          Refresh status
        </button>
      </div>
      {note && <p className="mt-2 text-[11.5px] text-txt3">{note}</p>}

      {/* List */}
      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<RefreshCw className="h-6 w-6" strokeWidth={1.5} />}
            title="No deployments match these filters."
            description="Try clearing your search, provider, or state filters."
          />
        ) : groups ? (
          <div className="space-y-4">
            {groups.map(([name, items]) => (
              <div key={name}>
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-txt3">
                  {name}
                  <span className="font-normal lowercase text-txt3">· {items.length}</span>
                </div>
                <Card variant="lit">
                  {items.map((r, i) => (
                    <div key={r.id} className={i < items.length - 1 ? "border-b border-border" : ""}>
                      <DeployRowView row={r} />
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <Card variant="lit">
            {filtered.map((r, i) => (
              <div key={r.id} className={i < filtered.length - 1 ? "border-b border-border" : ""}>
                <DeployRowView row={r} />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
