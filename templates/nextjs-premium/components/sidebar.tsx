"use client";

// App sidebar. Add a page by copying a NAV entry + creating app/(app)/<route>/page.tsx.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" },
  { href: "/settings", label: "Settings", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.94 4a7 7 0 0 0-.1-1.1l2.1-1.6-2-3.46-2.5 1a7 7 0 0 0-1.9-1.1l-.38-2.64h-4l-.38 2.64a7 7 0 0 0-1.9 1.1l-2.5-1-2 3.46 2.1 1.6a7 7 0 0 0 0 2.2l-2.1 1.6 2 3.46 2.5-1a7 7 0 0 0 1.9 1.1l.38 2.64h4l.38-2.64a7 7 0 0 0 1.9-1.1l2.5 1 2-3.46-2.1-1.6c.06-.36.1-.73.1-1.1Z" },
];

export default function Sidebar({ appName }: { appName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg font-bold">
          {appName.charAt(0).toUpperCase()}
        </span>
        <span className="text-sm font-semibold text-ink">{appName}</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface2 hover:text-ink",
              )}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
