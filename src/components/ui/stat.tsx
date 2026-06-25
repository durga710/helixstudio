import { cn } from "@/lib/utils";

/** A single metric tile — large tabular number, brand gradient underline,
 *  quiet label. Glass surface; drop into a grid of stats. */
export function Stat({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("glass hover-lift rounded-card px-4 py-3.5", className)}>
      <div className="text-h1 tabular-nums">{value}</div>
      <div className="mt-1.5 h-[3px] w-7 rounded-full brand-gradient-fill" />
      <div className="mt-1.5 text-[11.5px] text-txt2">{label}</div>
    </div>
  );
}
