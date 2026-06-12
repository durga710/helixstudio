import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsScreen } from "@/components/screens/settings-screen";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  return (
    <SettingsScreen
      initialName={session?.user?.name ?? null}
      initialImage={session?.user?.image ?? null}
    />
  );
}
