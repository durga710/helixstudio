"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "default" | "sm";
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onCheckedChange,
  size = "default",
  className,
  disabled,
  ...rest
}: SwitchProps) {
  const dims =
    size === "sm"
      ? { track: "h-[19px] w-[34px]", thumb: "h-[15px] w-[15px]", on: "translate-x-[15px]" }
      : { track: "h-[23px] w-10", thumb: "h-[17px] w-[17px]", on: "translate-x-[17px]" };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative shrink-0 cursor-pointer rounded-full border-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        dims.track,
        checked ? "bg-accent" : "bg-panel3",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-150",
          dims.thumb,
          checked ? dims.on : "translate-x-0"
        )}
      />
    </button>
  );
}
