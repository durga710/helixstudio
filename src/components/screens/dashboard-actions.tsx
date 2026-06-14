"use client";

import Link from "next/link";
import { Code2, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function DashboardActions() {
  // Both land on /editor — the "What do you want to make?" chooser.
  return (
    <div className="relative mt-[18px] flex flex-wrap gap-[9px]">
      <Link href="/editor" className={buttonVariants({ variant: "solid" })}>
        <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
        Start new project
      </Link>
      <Link href="/editor" className={buttonVariants({ variant: "ghost" })}>
        <Code2 className="h-[15px] w-[15px]" strokeWidth={1.7} />
        Open editor
      </Link>
    </div>
  );
}
