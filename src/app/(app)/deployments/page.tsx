import type { Metadata } from "next";
import { Rocket } from "lucide-react";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { Card } from "@/components/ui/card";
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
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Deployments</div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Deployments</h1>
          <p className="mt-1 text-[13px] text-txt2">Live deployment records across all your workspaces.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <Rocket className="h-8 w-8 text-txt3" strokeWidth={1.3} />
            <p className="text-sm text-txt3">No deployments yet.</p>
            <p className="max-w-xs text-xs text-txt3">
              Open a workspace in the Editor, then use the Deploy button to push to Vercel, Netlify, or another
              platform.
            </p>
          </Card>
        </div>
      ) : (
        <DeploymentsClient rows={rows} summary={summary} />
      )}
    </div>
  );
}
