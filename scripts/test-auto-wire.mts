// Verifies the auto-wire safety net: an orphaned feature component gets mounted
// on the dashboard; an already-wired one is left alone.
//   npx tsx scripts/test-auto-wire.mts
import { autoWireFeature } from "../src/lib/auto-wire.js";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string) => { c ? (pass++, console.log("  PASS", label)) : (fail++, console.log("  FAIL", label)); };

const DASH = "app/(app)/dashboard/page.tsx";
const calendar = `"use client";\nimport { useState } from "react";\nexport default function CalendarApp() { return <div>cal</div>; }`;
const placeholderDash = `"use client";\nexport default function DashboardPage(){ return <div>{/* AI: BUILD THE APP'S MAIN FEATURE HERE */}</div>; }`;

// Scenario 1: calendar component orphaned (no page imports it) → should wire it.
{
  const files: Record<string, string> = {
    [DASH]: placeholderDash,
    "components/calendar/calendar-app.tsx": calendar,
  };
  const writes: { path: string; content: string }[] = [];
  const res = await autoWireFeature({
    paths: Object.keys(files),
    written: ["components/calendar/calendar-app.tsx"],
    readFile: async (p) => files[p] ?? null,
    writeFiles: async (fs) => { writes.push(...fs); },
  });
  ok(res === DASH, "orphaned component → returns dashboard path");
  const wired = writes[0]?.content ?? "";
  ok(/import CalendarApp from "@\/components\/calendar\/calendar-app"/.test(wired), "imports the component (default)");
  ok(/<CalendarApp \/>/.test(wired), "renders the component");
  ok(!/AI: BUILD/.test(wired), "placeholder region is gone");
}

// Scenario 2: model already mounted it on the dashboard → should NOT touch it.
{
  const files: Record<string, string> = {
    [DASH]: `"use client";\nimport CalendarApp from "@/components/calendar/calendar-app";\nexport default function DashboardPage(){ return <CalendarApp/>; }`,
    "components/calendar/calendar-app.tsx": calendar,
  };
  const writes: { path: string; content: string }[] = [];
  const res = await autoWireFeature({
    paths: Object.keys(files),
    written: ["components/calendar/calendar-app.tsx"],
    readFile: async (p) => files[p] ?? null,
    writeFiles: async (fs) => { writes.push(...fs); },
  });
  ok(res === null && writes.length === 0, "already-wired component → left untouched");
}

// Scenario 3: named export under lib/mvc/views → wired with a named import.
{
  const view = `import React from "react";\nexport function CalendarView(){ return <div/>; }`;
  const files: Record<string, string> = {
    [DASH]: placeholderDash,
    "lib/mvc/views/calendar-view.tsx": view,
  };
  const writes: { path: string; content: string }[] = [];
  const res = await autoWireFeature({
    paths: Object.keys(files),
    written: ["lib/mvc/views/calendar-view.tsx"],
    readFile: async (p) => files[p] ?? null,
    writeFiles: async (fs) => { writes.push(...fs); },
  });
  ok(res === DASH, "lib/mvc view orphaned → wired");
  ok(/import { CalendarView } from "@\/lib\/mvc\/views\/calendar-view"/.test(writes[0]?.content ?? ""), "named import used");
}

// Scenario 4: not the premium skeleton (no dashboard page) → no-op.
{
  const writes: { path: string; content: string }[] = [];
  const res = await autoWireFeature({
    paths: ["index.html", "components/calendar/calendar-app.tsx"],
    written: ["components/calendar/calendar-app.tsx"],
    readFile: async () => calendar,
    writeFiles: async (fs) => { writes.push(...fs); },
  });
  ok(res === null && writes.length === 0, "no dashboard page → no-op");
}

console.log(`\n=== auto-wire: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
