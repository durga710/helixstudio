"use client";

import Link from "next/link";
import { Code2, Plus } from "lucide-react";
import { useShell } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";

export function DashboardActions() {
  const { setNewProjectOpen } = useShell();
  return (
    <div className="relative mt-[18px] flex flex-wrap gap-[9px]">
      <button className={buttonVariants({ variant: "solid" })} onClick={() => setNewProjectOpen(true)}>
        <Plus className="h-[15px] w-[15px]" strokeWidth={2} />
        Start new project
      </button>
      <Link href="/editor" className={buttonVariants({ variant: "ghost" })}>
        <Code2 className="h-[15px] w-[15px]" strokeWidth={1.7} />
        Open editor
      </Link>
    </div>
  );
}
