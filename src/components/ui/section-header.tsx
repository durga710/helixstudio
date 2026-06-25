import { cn } from "@/lib/utils";

/** Consistent section heading using the design type scale (text-h2).
 *  Optional trailing `action` (e.g. a "View all →" link) and leading `icon`. */
export function SectionHeader({
  title,
  action,
  icon,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 mt-8 flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="text-h2 truncate">{title}</h3>
        {icon}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
