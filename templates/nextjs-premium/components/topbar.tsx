"use client";

import { useRouter } from "next/navigation";
import { signOut, type User } from "@/lib/auth";
import { Button } from "@/components/ui";
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
        <div className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-sm font-semibold text-ink">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <Button variant="outline" onClick={handleSignOut} className="h-9 px-3">
          Sign out
        </Button>
      </div>
    </header>
  );
}
