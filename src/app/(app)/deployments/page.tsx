import type { Metadata } from "next";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DeploymentsClient, type DeployRow, type DeploySummary } from "./deployments-client";

export const metadata: Metadata = { title: "Deployments" };
export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  let rows: DeployRow[] = [];

  if (dbEnabled()) {
    const session = await auth();
    if (session?.user) {
      const deploys = await db().workspaceDeploy.findMany({
        where: { workspace: { userId: session.user.id } },
        select: {
          id: true,
          provider: true,
          projectName: true,
          productionUrl: true,
          dashboardUrl: true,
          lastState: true,
          lastDeployAt: true,
          createdAt: true,
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { lastDeployAt: { sort: "desc", nulls: "last" } },
        take: 100,
      });
      // Serialize Dates to ISO for the client boundary.
      rows = deploys.map((d) => ({
        id: d.id,
        provider: d.provider,
        projectName: d.projectName,
        productionUrl: d.productionUrl,
        dashboardUrl: d.dashboardUrl,
        lastState: d.lastState,
        lastDeployAt: d.lastDeployAt ? d.lastDeployAt.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
        workspace: d.workspace,
      }));
    }
  }

  const summary: DeploySummary = {
    total: rows.length,
    ready: rows.filter((r) => r.lastState === "READY").length,
    building: rows.filter((r) => r.lastState === "BUILDING" || r.lastState === "QUEUED").length,
    error: rows.filter((r) => r.lastState === "ERROR").length,
    projects: new Set(rows.map((r) => r.projectName)).size,
    providers: new Set(rows.map((r) => r.provider)).size,
  };

  return (
    <div className="pad-screen">
      <div className="text-eyebrow mb-[7px] text-accent">Deployments</div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Deployments</h1>
          <p className="mt-1 text-[13px] text-txt2">Live deployment records across all your workspaces.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={<Rocket className="h-6 w-6" strokeWidth={1.4} />}
            title="No deployments yet."
            description="Open a workspace in the Editor, then use the Deploy button to push to Vercel, Netlify, or another platform."
            action={
              <Link href="/editor">
                <Button variant="glow">
                  <Rocket className="h-4 w-4" /> Open the Editor
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <DeploymentsClient rows={rows} summary={summary} />
      )}
    </div>
  );
}
