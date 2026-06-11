"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, RotateCcw, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { timeAgo, cn } from "@/lib/utils";
import type { DeployEnvironment, DeploymentRecord, DeployState } from "@/lib/types";

interface LogLine {
  tone: "dim" | "ok" | "warn" | "done";
  text: string;
}

const statePill: Record<DeployState, { tone: "green" | "accent" | "red"; label: string }> = {
  ready: { tone: "green", label: "live" },
  building: { tone: "accent", label: "building" },
  failed: { tone: "red", label: "failed" },
};

function StateDot({ state }: { state: DeployState }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        state === "ready" && "bg-ok",
        state === "building" && "pulse-dot bg-accent",
        state === "failed" && "bg-bad"
      )}
    />
  );
}

export function DeploymentsScreen(props: {
  environments: DeployEnvironment[];
  deployments: DeploymentRecord[];
}) {
  const [environments, setEnvironments] = useState(props.environments);
  const [deployments, setDeployments] = useState(props.deployments);
  const [log, setLog] = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/deployments");
    if (!res.ok) return;
    const data = (await res.json()) as { environments: DeployEnvironment[]; deployments: DeploymentRecord[] };
    setEnvironments(data.environments);
    setDeployments(data.deployments);
  }, []);

  const streamLog = useCallback(() => {
    setLog([]);
    setStreaming(true);
    const es = new EventSource("/api/deployments/log");
    es.onmessage = (e) => {
      const line = JSON.parse(e.data) as LogLine;
      if (line.tone === "done") {
        es.close();
        setStreaming(false);
        refresh();
        return;
      }
      setLog((prev) => [...prev, line]);
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
    };
  }, [refresh]);

  // The seeded preview environment is mid-build — start its log on mount.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!environments.some((e) => e.state === "building")) return;
    const t = setTimeout(streamLog, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  async function deployMain() {
    setDeploying(true);
    try {
      const res = await fetch("/api/deployments", { method: "POST" });
      if (!res.ok) throw new Error("deploy failed");
      toast("Deployment started for main");
      await refresh();
      streamLog();
    } catch {
      toast("Deploy failed — try again");
    } finally {
      setDeploying(false);
    }
  }

  const building = environments.some((e) => e.state === "building");

  return (
    <div className="pad-screen">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Deployments</div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Deployments</h1>
          <p className="mt-1 text-[13px] text-txt2">acme-web · connected to Vercel</p>
        </div>
        <Button onClick={deployMain} disabled={deploying || streaming}>
          <Upload className="h-[15px] w-[15px]" strokeWidth={1.7} />
          {deploying ? "Starting…" : "Deploy main"}
        </Button>
      </div>

      {/* Environments */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {environments.map((env) => {
          const pill = statePill[env.state];
          return (
            <Card key={env.id} className="p-4">
              <div className="mb-[11px] flex items-center gap-2">
                <StateDot state={env.state} />
                <span className="text-[13px] font-semibold">{env.name}</span>
                <Pill tone={pill.tone} className="ml-auto">
                  {env.state === "ready" && env.id === "staging" ? "ready" : pill.label}
                </Pill>
              </div>
              <div className="flex items-center gap-1.5 break-all font-mono text-[11.5px] text-accent">
                <Link2 className="h-[13px] w-[13px] shrink-0" strokeWidth={1.7} />
                {env.url}
              </div>
              <div className="mt-1.5">
                <div className="flex justify-between border-b border-border py-1.5 text-xs text-txt2">
                  <span>Commit</span>
                  <span className="font-mono">{env.commit}</span>
                </div>
                {env.branch && (
                  <div className="flex justify-between border-b border-border py-1.5 text-xs text-txt2">
                    <span>Branch</span>
                    <span>{env.branch}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-border py-1.5 text-xs text-txt2">
                  <span>{env.state === "building" ? "Started" : "Deployed"}</span>
                  <span>{timeAgo(env.deployedAt)}</span>
                </div>
                {env.region && (
                  <div className="flex justify-between py-1.5 text-xs text-txt2">
                    <span>Region</span>
                    <span>{env.region}</span>
                  </div>
                )}
                {env.coverage !== undefined && (
                  <div className="flex justify-between py-1.5 text-xs text-txt2">
                    <span>Coverage</span>
                    <span>{env.coverage}%</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Build log */}
      <div className="mb-[11px] mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Build log · Preview</h3>
        <Pill tone={building || streaming ? "accent" : "green"}>{building || streaming ? "building" : "ready"}</Pill>
      </div>
      <div
        ref={logRef}
        className="scroll-area max-h-[220px] overflow-auto rounded-[9px] border border-border bg-codebg px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.8]"
      >
        {log.length === 0 && <div className="text-txt3">No build running — deploy main to stream a build log.</div>}
        {log.map((line, i) => (
          <div
            key={i}
            className={cn(
              line.tone === "ok" && "text-ok",
              line.tone === "warn" && "text-warn",
              line.tone === "dim" && "text-txt3"
            )}
          >
            {line.text}
          </div>
        ))}
        {streaming && <div className="pulse-dot text-accent">▍</div>}
      </div>

      {/* Recent deployments */}
      <div className="mb-[11px] mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent deployments</h3>
      </div>
      <Card>
        {deployments.map((d, i) => (
          <div
            key={d.id}
            className={cn(
              "flex items-center gap-[13px] px-4 py-3",
              i < deployments.length - 1 && "border-b border-border"
            )}
          >
            <StateDot state={d.state} />
            <span className="w-[70px] font-mono text-xs text-txt">{d.sha}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt2">{d.message}</span>
            <span className="text-[11.5px] text-txt3">{d.author}</span>
            <span className="w-[74px] text-right text-[11.5px] text-txt3">{timeAgo(d.at)}</span>
            {d.state === "failed" && (
              <button
                title="Roll back to previous deployment"
                onClick={() => toast(`Rolled back past ${d.sha}`)}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-border2 bg-panel2 text-txt2 hover:text-txt"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
