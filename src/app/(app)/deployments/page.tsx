import type { Metadata } from "next";
import { ExternalLink, Rocket } from "lucide-react";
import { auth } from "@/lib/auth";
import { db, dbEnabled } from "@/lib/db";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

export const metadata: Metadata = { title: "Deployments" };
export const dynamic = "force-dynamic";

const STATE_TONE: Record<string, "green" | "accent" | "red" | "neutral"> = {
  READY: "green",
  BUILDING: "accent",
  QUEUED: "accent",
  ERROR: "red",
  CANCELED: "neutral",
  UNKNOWN: "neutral",
};

export default async function DeploymentsPage() {
  let deploys: {
    id: string;
    provider: string;
    projectName: string;
    productionUrl: string | null;
    dashboardUrl: string | null;
    lastState: string | null;
    lastDeployAt: Date | null;
    workspace: { name: string };
  }[] = [];

  if (dbEnabled()) {
    const session = await auth();
    if (session?.user) {
      deploys = await db().workspaceDeploy.findMany({
        where: { workspace: { userId: session.user.id } },
        select: {
          id: true,
          provider: true,
          projectName: true,
          productionUrl: true,
          dashboardUrl: true,
          lastState: true,
          lastDeployAt: true,
          workspace: { select: { name: true } },
        },
        orderBy: { lastDeployAt: { sort: "desc", nulls: "last" } },
        take: 50,
      });
    }
  }

  return (
    <div className="pad-screen">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Deployments</div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Deployments</h1>
          <p className="mt-1 text-[13px] text-txt2">
            Live deployment records across all your workspaces.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {deploys.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <Rocket className="h-8 w-8 text-txt3" strokeWidth={1.3} />
            <p className="text-sm text-txt3">No deployments yet.</p>
            <p className="max-w-xs text-xs text-txt3">
              Open a workspace in the Editor, then use the Deploy button to push to Vercel, Netlify, or another platform.
            </p>
          </Card>
        ) : (
          <Card>
            {deploys.map((d, i) => {
              const state = d.lastState ?? "UNKNOWN";
              const tone = STATE_TONE[state] ?? "neutral";
              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-4 px-4 py-3 ${i < deploys.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {d.workspace.name}
                      <span className="font-normal text-txt3">·</span>
                      <span className="font-mono text-[12px] text-txt2">{d.projectName}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11.5px] capitalize text-txt3">{d.provider}</span>
                      {d.productionUrl && (
                        <>
                          <span className="text-txt3">·</span>
                          <a
                            href={d.productionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                          >
                            {d.productionUrl.replace(/^https?:\/\//, "").slice(0, 40)}
                            <ExternalLink className="h-[11px] w-[11px]" strokeWidth={1.7} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Pill tone={tone} className="capitalize">{state.toLowerCase()}</Pill>
                    {d.lastDeployAt && (
                      <span className="text-[11.5px] text-txt3">{timeAgo(d.lastDeployAt.toISOString())}</span>
                    )}
                    {d.dashboardUrl && (
                      <a
                        href={d.dashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid h-7 w-7 place-items-center rounded-md border border-border2 bg-panel2 text-txt3 hover:text-txt"
                        title="View in platform dashboard"
                      >
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
