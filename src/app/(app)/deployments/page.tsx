import type { Metadata } from "next";
import { store } from "@/lib/store";
import { DeploymentsScreen } from "@/components/screens/deployments-screen";

export const metadata: Metadata = { title: "Deployments" };
export const dynamic = "force-dynamic";

export default function DeploymentsPage() {
  const { environments, deployments } = store();
  return <DeploymentsScreen environments={environments} deployments={deployments} />;
}
