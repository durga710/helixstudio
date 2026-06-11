import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Signed-out visitors land on the public marketing page (Phase 0).
  if (!session?.user) redirect("/welcome");

  const initials =
    (session.user.name ?? session.user.email ?? "U")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "U";

  return <AppShell userInitials={initials}>{children}</AppShell>;
}
