"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { signOut, type User } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemePicker from "@/components/theme-picker";

export default function Topbar({ user }: { user: User }) {
  const router = useRouter();

  function handleSignOut() {
    signOut();
    router.replace("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 md:px-6">
      <div className="text-sm text-muted">
        Welcome back, <span className="font-medium text-ink">{user.name}</span>
      </div>
      <div className="flex items-center gap-3">
        <ThemePicker />
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Avatar>
              <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SettingsIcon /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSignOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
