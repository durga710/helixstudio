import { cn } from "@/lib/utils";

/** Shimmering placeholder for loading states. Set width/height via className.
 *  Honors prefers-reduced-motion (the shimmer is disabled globally). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}
