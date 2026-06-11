"use client";

import { useMemo, useState } from "react";
import { Bot, Database, Layers, Plus, Scale, Search, ShieldCheck, SquareSlash, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useShell } from "@/components/shell/shell-context";
import {
  ALL_ENTRIES,
  SOURCE_LABELS,
  type CatalogEntry,
  type SkillSource,
} from "@/data/skill-catalog";

type SourceFilter = "all" | SkillSource;

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  "Plan & Spec": Layers,
  "Build & Ship": Wrench,
  "Quality & Safety": ShieldCheck,
  Maintain: Database,
  "Core Workflows": Layers,
  "Languages & Frameworks": Wrench,
  "Data, AI & Content": Database,
  Subagents: Bot,
  Commands: SquareSlash,
  Rules: Scale,
};

const GROUP_ORDER = [
  "Plan & Spec",
  "Build & Ship",
  "Quality & Safety",
  "Maintain",
  "Core Workflows",
  "Languages & Frameworks",
  "Data, AI & Content",
  "Subagents",
  "Commands",
  "Rules",
];

export function SkillsScreen() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const { setNewProjectOpen } = useShell();
  const { toast } = useToast();

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return ALL_ENTRIES.filter(
      (e) =>
        (source === "all" || e.source === source) &&
        (q === "" || e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.tag.includes(q))
    );
  }, [query, source]);

  const groups = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const entry of visible) {
      map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [visible]);

  const scoped = ALL_ENTRIES.filter((e) => source === "all" || e.source === source);
  const enabledCount = scoped.filter((e) => !disabled.has(e.id)).length;

  function toggle(entry: CatalogEntry) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  }

  return (
    <div className="pad-screen">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Capabilities</div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Skills</h1>
          <p className="mt-1 text-[13px] text-txt2">
            24 Helix engineering skills (MIT) + the Everything Claude Code plugin — skills, subagents,
            commands, and rules · loaded on demand
          </p>
        </div>
        <Button variant="ghost" onClick={() => setNewProjectOpen(true)}>
          <Plus className="h-[15px] w-[15px]" strokeWidth={1.7} />
          Add skill
        </Button>
      </div>

      <div className="mb-1 mt-4 flex flex-wrap items-center gap-2.5">
        <div className="flex w-full max-w-[340px] items-center gap-2 rounded-lg border border-border2 bg-panel px-[11px] py-[7px]">
          <Search className="h-[15px] w-[15px] text-txt3" strokeWidth={1.7} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter skills…"
            aria-label="Filter skills"
            autoComplete="off"
            className="w-full border-none bg-transparent font-sans text-[12.5px] text-txt outline-none placeholder:text-txt3"
          />
        </div>
        <Segmented<SourceFilter>
          aria-label="Skill source"
          value={source}
          onChange={setSource}
          options={[
            { value: "all", label: "All" },
            { value: "helix", label: "Helix" },
            { value: "ecc", label: "ECC" },
          ]}
        />
        <Pill tone="green">{enabledCount} enabled</Pill>
        {source !== "all" && <span className="text-[11.5px] text-txt3">{SOURCE_LABELS[source]}</span>}
      </div>

      {groups.length === 0 && (
        <Card className="mt-4 p-8 text-center text-sm text-txt3">
          No skills match &ldquo;{query}&rdquo;.
        </Card>
      )}

      {groups.map(([group, entries]) => {
        const Icon = GROUP_ICONS[group] ?? Layers;
        return (
          <div key={group}>
            <div className="mb-[11px] mt-5 flex items-center gap-2 text-[12.5px] font-semibold">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
              </span>
              {group}
              <span className="rounded-full border border-border2 px-2 text-[10.5px] font-semibold text-txt3">
                {entries.length}
              </span>
              {entries[0]?.source === "ecc" && (
                <Pill tone="accent" className="ml-1">
                  ECC
                </Pill>
              )}
            </div>
            <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => {
                const enabled = !disabled.has(entry.id);
                return (
                  <Card
                    key={entry.id}
                    className="flex cursor-pointer flex-col gap-[7px] p-3.5 transition-all duration-150 hover:-translate-y-px hover:border-accent"
                    onClick={() => toast(`${entry.name} — ${entry.kind} from ${SOURCE_LABELS[entry.source]}`)}
                  >
                    <div className="flex items-center gap-[9px]">
                      <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] font-mono text-[11px] font-bold uppercase tracking-[0.02em] text-accent">
                        {entry.code}
                      </div>
                      <div className="truncate font-mono text-xs font-semibold text-txt">{entry.name}</div>
                    </div>
                    <div className="flex-1 text-xs leading-[1.45] text-txt2">{entry.description}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-txt3">{entry.tag}</span>
                      <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          size="sm"
                          checked={enabled}
                          onCheckedChange={() => toggle(entry)}
                          aria-label={`Toggle ${entry.name}`}
                        />
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
