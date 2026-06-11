"use client";

import Link from "next/link";
import { ChartLine, Code2 } from "lucide-react";
import { useShell } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.2.48-2.67-1.06-2.67-1.06-.36-.92-.88-1.16-.88-1.16-.72-.49.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.21 1.86.86 2.31.66.07-.52.28-.86.5-1.06-1.75-.2-3.6-.88-3.6-3.9 0-.86.31-1.56.82-2.11-.08-.2-.36-1 .08-2.09 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.53-1.01 2.2-.8 2.2-.8.44 1.09.16 1.89.08 2.09.51.55.82 1.25.82 2.11 0 3.03-1.85 3.7-3.61 3.89.29.24.54.72.54 1.45v2.15c0 .21.15.45.55.38A8 8 0 0 0 8 0z" />
    </svg>
  );
}

export function DashboardActions() {
  const { setNewProjectOpen } = useShell();
  return (
    <div className="relative mt-[18px] flex flex-wrap gap-[9px]">
      <Link href="/editor" className={buttonVariants({ variant: "solid" })}>
        <Code2 className="h-[15px] w-[15px]" strokeWidth={1.7} />
        Open editor
      </Link>
      <Link href="/analysis" className={buttonVariants({ variant: "ghost" })}>
        <ChartLine className="h-[15px] w-[15px]" strokeWidth={1.7} />
        Analyze a repo
      </Link>
      <button className={buttonVariants({ variant: "ghost" })} onClick={() => setNewProjectOpen(true)}>
        <GitHubMark className="h-[15px] w-[15px]" />
        Import from GitHub
      </button>
    </div>
  );
}
