"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Code2,
  Home,
  LogOut,
  Settings,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

// Analysis/Agents/Skills/Deployments/Team are demo-only screens — hidden
// from the nav until they run on real data (pages still exist by URL).
export const NAV_ITEMS = [
  { href: "/", title: "Home", icon: Home },
  { href: "/editor", title: "Editor", icon: Code2 },
] as const;

export function Rail({ userInitials }: { userInitials: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const railBtn = (active: boolean) =>
    cn(
      "relative grid h-[38px] w-10 cursor-pointer place-items-center rounded-[9px] border-none bg-transparent text-txt3 transition-colors",
      active
        ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-txt before:absolute before:-left-3 before:top-2 before:h-[22px] before:w-[2.5px] before:rounded-sm before:brand-gradient-fill before:[background:linear-gradient(180deg,var(--brand-cyan),var(--accent)_60%,var(--brand-violet))]"
        : "hover:bg-panel2 hover:text-txt"
    );

  return (
    <nav className="flex flex-col items-center gap-[3px] border-r border-border bg-bg2 py-3" aria-label="Primary">
      <Link
        href="/"
        title="Helix Studio"
        className="mb-3 grid h-[34px] w-[34px] cursor-pointer place-items-center overflow-hidden rounded-[9px] shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
      >
        <BrandMark size={34} />
      </Link>
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} title={item.title} aria-current={active ? "page" : undefined} className={railBtn(active)}>
            <item.icon className="h-[19px] w-[19px]" strokeWidth={1.7} />
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link href="/settings" title="Settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined} className={railBtn(pathname.startsWith("/settings"))}>
        <Settings className="h-[19px] w-[19px]" strokeWidth={1.7} />
      </Link>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            title="Account"
            className="mt-1 grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg border-none bg-gradient-to-br from-[#8b5cf6] to-accent text-[11px] font-semibold text-white"
          >
            {userInitials}
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            side="right"
            align="end"
            sideOffset={8}
            className="fade-up z-50 min-w-40 rounded-card border border-border2 bg-panel p-1 shadow-pop"
          >
            <Dropdown.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-txt2 outline-none data-highlighted:bg-panel2 data-highlighted:text-txt"
              onSelect={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Dropdown.Item>
            <Dropdown.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-txt2 outline-none data-highlighted:bg-panel2 data-highlighted:text-txt"
              onSelect={() => router.push("/settings")}
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </nav>
  );
}
