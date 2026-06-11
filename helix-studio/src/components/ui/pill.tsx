import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-[5px] rounded-full border px-2 py-px text-[10.5px] font-semibold",
  {
    variants: {
      tone: {
        neutral: "border-border2 text-txt2",
        green:
          "border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_9%,transparent)] text-ok",
        amber:
          "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_9%,transparent)] text-warn",
        red: "border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_9%,transparent)] text-bad",
        accent:
          "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] text-accent",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

export function Pill({ className, tone, ...props }: PillProps) {
  return <span className={cn(pillVariants({ tone }), className)} {...props} />;
}
