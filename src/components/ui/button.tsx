import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-sans transition-[color,background,border-color,filter] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        solid:
          "rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:brightness-110",
        glow:
          "rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-[0_6px_20px_-6px_color-mix(in_srgb,var(--accent)_75%,transparent)] hover:-translate-y-px hover:shadow-[0_10px_28px_-6px_color-mix(in_srgb,var(--accent)_90%,transparent)] active:translate-y-0",
        ghost:
          "rounded-lg border border-border2 bg-panel px-[11px] py-1.5 text-xs font-medium text-txt2 hover:border-accent hover:text-txt",
        mini: "rounded-card-sm border border-border2 bg-panel2 px-2.5 py-[5px] text-[11px] text-txt2 hover:text-txt",
        "mini-accept":
          "rounded-card-sm border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_13%,transparent)] px-2.5 py-[5px] text-[11px] text-ok hover:brightness-110",
        icon: "h-8 w-8 rounded-lg border border-transparent bg-transparent text-txt2 hover:bg-panel2 hover:text-txt",
      },
    },
    defaultVariants: {
      variant: "solid",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { buttonVariants };
