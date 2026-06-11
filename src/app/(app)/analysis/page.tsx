import type { Metadata } from "next";
import {
  ChartLine,
  Cpu,
  Database,
  Gauge,
  Globe,
  Lock,
  Monitor,
  Package,
  Server,
} from "lucide-react";
import { store } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { NextLogo, PrismaLogo } from "@/components/logos";
import type { AnalysisRisk } from "@/lib/types";

export const metadata: Metadata = { title: "Repository Analysis" };
export const dynamic = "force-dynamic";

const FLOW_ICONS = [Monitor, Server, Cpu, Database];

const riskTone: Record<AnalysisRisk["severity"], "red" | "amber"> = {
  high: "red",
  medium: "amber",
  low: "amber",
};

function riskIcon(risk: AnalysisRisk) {
  if (risk.kind === "security") return <Lock className="h-[18px] w-[18px]" strokeWidth={1.7} />;
  if (risk.kind === "performance") return <Gauge className="h-[18px] w-[18px]" strokeWidth={1.7} />;
  return <Package className="h-[18px] w-[18px]" strokeWidth={1.7} />;
}

export default function AnalysisPage() {
  const { analysis, projects } = store();
  const project = projects.find((p) => p.id === analysis.projectId);

  return (
    <div className="pad-screen">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">
        Repository analysis
      </div>
      <h1 className="text-[22px] font-bold tracking-tight">{project?.name ?? analysis.projectId}</h1>
      <p className="mt-1 text-[13px] text-txt2">
        Static scan completed in {analysis.scanSeconds}s · {analysis.files.toLocaleString()} files · last
        commit {timeAgo(analysis.lastCommit)}
      </p>

      <div className="mt-[18px] grid grid-cols-1 gap-3.5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-[18px]">
          <h4 className="mb-[11px] flex items-center gap-[7px] text-[12.5px] font-semibold">
            <ChartLine className="h-[15px] w-[15px] text-accent" strokeWidth={1.7} />
            Project overview
          </h4>
          {analysis.overview.map((row, i) => (
            <div
              key={row.k}
              className={`flex justify-between gap-3 py-2 text-[12.5px] ${
                i < analysis.overview.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <span className="text-txt2">{row.k}</span>
              <span className="text-right">{row.v}</span>
            </div>
          ))}

          <h4 className="mb-[11px] mt-5 flex items-center gap-[7px] text-[12.5px] font-semibold">
            <Globe className="h-[15px] w-[15px] text-accent" strokeWidth={1.7} />
            Data flow
          </h4>
          <div className="mt-[5px] flex flex-wrap items-center gap-2">
            {analysis.dataFlow.map((step, i) => {
              const Icon = FLOW_ICONS[i % FLOW_ICONS.length];
              return (
                <span key={step} className="contents">
                  <span className="flex items-center gap-[7px] rounded-lg border border-border2 bg-panel2 px-[11px] py-2 text-xs">
                    <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={1.7} />
                    {step}
                  </span>
                  {i < analysis.dataFlow.length - 1 && <span className="text-txt3">→</span>}
                </span>
              );
            })}
          </div>
        </Card>

        <Card className="p-[18px]">
          <h4 className="mb-[11px] flex items-center gap-[7px] text-[12.5px] font-semibold">
            <Package className="h-[15px] w-[15px] text-accent" strokeWidth={1.7} />
            Dependencies
          </h4>
          {analysis.dependencies.map((dep, i) => (
            <div
              key={dep.name}
              className={`flex items-center justify-between py-[9px] ${
                i < analysis.dependencies.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <span className="flex items-center gap-[7px] font-mono text-xs">
                {dep.name === "next" && <NextLogo size={16} />}
                {dep.name === "@prisma/client" && <PrismaLogo size={16} />}
                {dep.name}
              </span>
              <Pill tone={dep.status === "ok" ? "green" : "amber"}>{dep.version}</Pill>
            </div>
          ))}
        </Card>
      </div>

      <div className="mb-[11px] mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Potential risks</h3>
        <span className="text-[11.5px] text-txt3">Surfaced by Security &amp; Performance agents</span>
      </div>
      <Card className="p-[18px]">
        {analysis.risks.map((risk, i) => (
          <div
            key={risk.id}
            className={`flex items-center gap-[11px] rounded-[9px] border border-border2 bg-panel2 p-3 ${
              i < analysis.risks.length - 1 ? "mb-[9px]" : ""
            }`}
          >
            <div
              className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg ${
                risk.severity === "high"
                  ? "bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-bad"
                  : "bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] text-warn"
              }`}
            >
              {riskIcon(risk)}
            </div>
            <div className="min-w-0">
              <h5 className="text-[12.5px] font-semibold">{risk.title}</h5>
              <p className="text-xs text-txt2">{risk.detail}</p>
            </div>
            <Pill tone={riskTone[risk.severity]} className="ml-auto shrink-0 capitalize">
              {risk.severity}
            </Pill>
          </div>
        ))}
      </Card>
    </div>
  );
}
