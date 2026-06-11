import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-card border border-border2 bg-panel px-3 py-2 font-sans text-sm text-txt outline-none transition-colors placeholder:text-txt3 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-card border border-border2 bg-panel px-3 py-2 font-sans text-sm text-txt outline-none transition-colors placeholder:text-txt3 focus:border-accent",
        className
      )}
      {...props}
    />
  );
}
