import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-card border", {
  variants: {
    variant: {
      // default keeps the original flat panel so existing usages are unchanged.
      default: "border-border bg-panel shadow-card",
      // lit = subtle top highlight + ambient shadow (reads as a raised surface).
      lit: "border-border2 bg-panel lit",
      // glass = frosted translucent panel (best over an aurora/colored backdrop).
      glass: "glass border-transparent",
      // interactive = lit surface with the springy accent-glow hover lift.
      interactive: "border-border bg-panel lit hover-lift cursor-pointer",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export { cardVariants };
