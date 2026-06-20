"use client";

// App shell — opens DIRECTLY to the app (no forced login). The mock auth in
// lib/auth.ts is kept as an OPTIONAL feature: if a stored session exists we use
// it, otherwise the app runs as a guest. Wire login as a real gate only if the
// user asks for it. Add pages under app/(app)/.
import { useEffect, useState } from "react";
import { getUser, type User } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";

const GUEST: User = { name: "Guest", email: "guest@demo.app" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(GUEST);

  // Hydrate a real session if one exists — but never block on it.
  useEffect(() => {
    const u = getUser();
    if (u) setUser(u);
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar appName={APP_NAME} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
