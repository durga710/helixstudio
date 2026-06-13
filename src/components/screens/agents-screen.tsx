"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspacePicker } from "@/components/screens/workspace-picker";
import {
  DraftingCompass,
  ListTodo,
  Play,
  Search,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { usePrefs } from "@/hooks/use-prefs";
import { HelixGlyph } from "@/components/brand";
import { FINAL_OUTPUT, PIPELINE_STEPS, type PipelineStep, type StepEvent } from "@/lib/agents/pipeline";
import type { AgentInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type StepState = "idle" | "active" | "done";

const STEP_META: Record<PipelineStep, { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  planner: { label: "Planner", icon: ListTodo },
  architect: { label: "Architect", icon: DraftingCompass },
  engineer: { label: "Engineer", icon: Wrench },
  reviewer: { label: "Reviewer", icon: Search },
  security: { label: "Security", icon: ShieldCheck },
  performance: { label: "Performance", icon: Zap },
};

const CARD_ORDER: Array<{ step: PipelineStep; agentId: string }> = [
  { step: "architect", agentId: "architect" },
  { step: "engineer", agentId: "engineer" },
  { step: "reviewer", agentId: "reviewer" },
  { step: "security", agentId: "security" },
  { step: "performance", agentId: "performance" },
];

export function AgentsScreen({
  agents,
  workspaceId,
  workspaceName,
}: {
  agents: AgentInfo[];
  workspaceId?: string;
  workspaceName?: string;
}) {
  const [states, setStates] = useState<Record<PipelineStep, StepState>>(
    () => Object.fromEntries(PIPELINE_STEPS.map((s) => [s, "idle"])) as Record<PipelineStep, StepState>
  );
  const [results, setResults] = useState<Partial<Record<PipelineStep, string>>>({});
  const [liveLogs, setLiveLogs] = useState<Partial<Record<PipelineStep, string[]>>>({});
  const [running, setRunning] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [finalReady, setFinalReady] = useState(false);
  const gateResolve = useRef<((ok: boolean) => void) | null>(null);
  const { prefs } = usePrefs();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const autoRan = useRef(false);

  const runStepSSE = useCallback((step: PipelineStep) => {
    return new Promise<void>((resolve, reject) => {
      const wsParam = workspaceId ? `&w=${workspaceId}` : "";
      const es = new EventSource(`/api/agents/run?step=${step}${wsParam}`);
      es.onmessage = (e) => {
        const event = JSON.parse(e.data) as StepEvent;
        if (event.type === "start") {
          setStates((s) => ({ ...s, [step]: "active" }));
        } else if (event.type === "log" && event.message) {
          setLiveLogs((l) => ({ ...l, [step]: [...(l[step] ?? []), event.message!] }));
        } else if (event.type === "done") {
          setStates((s) => ({ ...s, [step]: "done" }));
          setResults((r) => ({ ...r, [step]: event.result }));
          es.close();
          resolve();
        }
      };
      es.onerror = () => {
        es.close();
        reject(new Error(`Step ${step} failed`));
      };
    });
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setFinalReady(false);
    setStates(Object.fromEntries(PIPELINE_STEPS.map((s) => [s, "idle"])) as Record<PipelineStep, StepState>);
    setResults({});
    setLiveLogs({});

    try {
      for (const step of PIPELINE_STEPS) {
        // Confirm-before-action gate: agents pause for approval before the
        // Engineer writes files (Settings → "Confirm before every action").
        if (step === "engineer" && prefs.confirmActions) {
          const ok = await new Promise<boolean>((resolve) => {
            gateResolve.current = resolve;
            setGateOpen(true);
          });
          setGateOpen(false);
          if (!ok) {
            toast("Workflow paused — Engineer step not approved");
            setRunning(false);
            return;
          }
        }
        await runStepSSE(step);
      }
      setFinalReady(true);
      toast("Workflow complete — 0 blocking issues");
    } catch {
      toast("Workflow hit an error — run it again");
    } finally {
      setRunning(false);
    }
  }, [running, prefs.confirmActions, runStepSSE, toast]);

  useEffect(() => {
    if (searchParams.get("run") === "1" && !autoRan.current) {
      autoRan.current = true;
      run();
    }
  }, [searchParams, run]);

  const pillFor = (state: StepState): { tone: "neutral" | "accent" | "green"; label: string } =>
    state === "active" ? { tone: "accent", label: "active" } : state === "done" ? { tone: "green", label: "done" } : { tone: "neutral", label: "idle" };

  return (
    <div className="pad-screen">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">
        Multi-agent workflow
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Agents</h1>
          <p className="mt-1 text-[13px] text-txt2">
            {workspaceName
              ? `Running on ${workspaceName} — six specialists collaborate on every task.`
              : "Six specialists collaborate on every task — select a workspace to analyze."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense>
            <WorkspacePicker />
          </Suspense>
          <Button onClick={run} disabled={running}>
            <Play className="h-[15px] w-[15px]" strokeWidth={2} />
            {running ? "Running…" : "Run workflow"}
          </Button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="my-4 flex overflow-hidden rounded-card border border-border bg-panel">
        {PIPELINE_STEPS.map((step, i) => {
          const meta = STEP_META[step];
          const state = states[step];
          return (
            <div
              key={step}
              className={cn(
                "flex-1 px-3 py-3.5 text-center transition-colors duration-200",
                i < PIPELINE_STEPS.length - 1 && "border-r border-border",
                state === "done" && "bg-[color-mix(in_srgb,var(--green)_7%,transparent)]",
                state === "active" && "bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]"
              )}
            >
              <div
                className={cn(
                  "mx-auto mb-2 grid h-[30px] w-[30px] place-items-center rounded-[9px]",
                  state === "done" && "bg-[color-mix(in_srgb,var(--green)_16%,transparent)] text-ok",
                  state === "active" && "brand-gradient-fill text-white shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_45%,transparent)]",
                  state === "idle" && "bg-panel2 text-txt2"
                )}
              >
                <meta.icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </div>
              <div className="text-xs font-semibold">{meta.label}</div>
              <div
                className={cn(
                  "mt-0.5 text-[10.5px]",
                  state === "done" ? "text-ok" : state === "active" ? "text-accent" : "text-txt3"
                )}
              >
                {state === "active" ? "Running…" : results[step] ?? "Idle"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 gap-[13px] md:grid-cols-2">
        {CARD_ORDER.map(({ step, agentId }) => {
          const agent = agents.find((a) => a.id === agentId);
          if (!agent) return null;
          const meta = STEP_META[step];
          const pill = pillFor(states[step]);
          const logs = liveLogs[step] ?? agent.notes;
          return (
            <Card key={step} className="p-4">
              <div className="mb-2.5 flex items-center gap-[11px]">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-panel2 text-accent">
                  <meta.icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{agent.name}</div>
                  <div className="text-[11.5px] text-txt3">{agent.role}</div>
                </div>
                <Pill tone={pill.tone}>{pill.label}</Pill>
              </div>
              <div className="mt-[9px] flex flex-col gap-[5px] border-l-2 border-border2 pl-[11px] text-xs text-txt2">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-[7px]">
                    <span className="font-mono text-[11px] text-txt3">—</span>
                    {log}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {/* Final output */}
        <Card className="bg-[radial-gradient(360px_110px_at_100%_0,color-mix(in_srgb,var(--accent)_9%,transparent),transparent)] p-4">
          <div className="mb-2.5 flex items-center gap-[11px]">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-accent to-[color-mix(in_srgb,var(--accent)_55%,#000)] text-white">
              <HelixGlyph size={15} />
            </div>
            <div>
              <div className="text-[13.5px] font-semibold">Final output</div>
              <div className="text-[11.5px] text-txt3">Combined recommendation</div>
            </div>
          </div>
          <div className="mt-[5px] text-xs text-txt2">
            Understanding · Plan · Implementation · Review · Security · Performance · Next steps.
          </div>
          <Button variant="ghost" className="mt-[11px]" disabled={!finalReady} onClick={() => setFinalOpen(true)}>
            {finalReady ? "View final output" : running ? "Running…" : "Awaiting agents…"}
          </Button>
        </Card>
      </div>

      {/* Confirm-before-action gate */}
      <Dialog
        open={gateOpen}
        onOpenChange={(open) => {
          if (!open) gateResolve.current?.(false);
        }}
      >
        <DialogContent>
          <DialogHeader
            title="Engineer is ready to write files"
            description="Confirm before every action is enabled — the Engineer agent will modify app/api/invites.ts and run one migration."
          />
          <div className="flex justify-end gap-2 px-5 py-4">
            <Button variant="ghost" onClick={() => gateResolve.current?.(false)}>
              Not now
            </Button>
            <Button onClick={() => gateResolve.current?.(true)}>Approve &amp; continue</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Final output dialog */}
      <Dialog open={finalOpen} onOpenChange={setFinalOpen}>
        <DialogContent>
          <DialogHeader title={FINAL_OUTPUT.title} description="Combined output from all six agents" />
          <div className="scroll-area max-h-[55vh] overflow-auto p-5">
            {FINAL_OUTPUT.sections.map((section) => (
              <div key={section.h} className="mb-3.5">
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent">
                  {section.h}
                </div>
                <p className="text-[12.5px] text-txt2">{section.body}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
