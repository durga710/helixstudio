import { cn } from "@/lib/utils";

/** Friendly, consistent empty state — dashed glass frame, icon medallion,
 *  title, optional description and a call-to-action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card-lg border border-dashed border-border2 bg-[color-mix(in_srgb,var(--panel)_55%,transparent)] px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-border2 bg-panel2 text-accent lit">
          {icon}
        </div>
      )}
      <p className="text-h3 text-txt">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-txt2">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
