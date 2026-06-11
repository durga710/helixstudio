import type { Metadata } from "next";
import { Suspense } from "react";
import { store } from "@/lib/store";
import { AgentsScreen } from "@/components/screens/agents-screen";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default function AgentsPage() {
  const { agents } = store();
  return (
    <Suspense>
      <AgentsScreen agents={agents} />
    </Suspense>
  );
}
