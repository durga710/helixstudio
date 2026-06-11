"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ...rest
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest["aria-label"]}
      className={cn("flex rounded-lg border border-border2 bg-panel2 p-[3px]", className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex cursor-pointer items-center gap-[5px] rounded-md border-none px-3 py-1.5 text-xs transition-colors",
            value === opt.value ? "bg-panel text-txt shadow-card" : "bg-transparent text-txt2 hover:text-txt"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
