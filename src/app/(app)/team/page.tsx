import type { Metadata } from "next";
import { store } from "@/lib/store";
import { TeamScreen } from "@/components/screens/team-screen";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default function TeamPage() {
  const { members, invites, audit } = store();
  return <TeamScreen members={members} invites={invites} audit={audit} />;
}
