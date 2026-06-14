"use client";

// Authenticated app shell: redirects to /login if there's no session, otherwise
// renders the sidebar + topbar around the page. Add pages under app/(app)/.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, type User } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  if (!ready || !user) {
    return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>;
  }

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
