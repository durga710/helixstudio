import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { BuildLanding } from "@/components/build/build-landing";

export const metadata: Metadata = {
  title: "Start building",
  description: "Describe the app you want — Helix builds it and shows you a live preview while it works.",
};
export const dynamic = "force-dynamic";

/* Public prompt-first entry: no account needed — visitors get a guest
 * session on submit, and their work transfers when they sign up. */
export default async function BuildPage() {
  const session = await auth();
  return (
    <BuildLanding
      signedIn={Boolean(session?.user && !session.user.isGuest)}
      isGuest={Boolean(session?.user?.isGuest)}
      dbReady={dbEnabled()}
    />
  );
}
