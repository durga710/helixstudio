/** Tiny presentational pieces shared by the /admin pages (server-safe). */

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card-lg border border-border bg-panel p-4">
      <div className="label-tactical text-[10px]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-txt">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-txt3">{sub}</div>}
    </div>
  );
}

export function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-[12.5px] text-txt2">{k}</span>
      <span className="text-right font-mono text-[12px] text-txt">{v}</span>
    </div>
  );
}

export const fmt = (n: number) => n.toLocaleString();
export const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
