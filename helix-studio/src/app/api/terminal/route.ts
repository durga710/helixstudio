import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getFile, store } from "@/lib/store";
import type { FileNode } from "@/lib/types";

export const dynamic = "force-dynamic";

/* Sandboxed terminal (Phase 4). Commands run against the in-memory workspace
 * through an explicit allowlist — nothing touches the host shell. */

interface Line {
  text: string;
  tone: "out" | "ok" | "err" | "dim";
}

const bodySchema = z.object({ command: z.string().trim().min(1).max(500) });

function listPaths(nodes: FileNode[], prefix = ""): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(`${prefix}${node.name}/`);
      out.push(...listPaths(node.children, `${prefix}${node.name}/`));
    } else {
      out.push(`${prefix}${node.name}`);
    }
  }
  return out;
}

function collectChanges(nodes: FileNode[]): Array<{ path: string; change: "M" | "A" }> {
  const out: Array<{ path: string; change: "M" | "A" }> = [];
  for (const node of nodes) {
    if (node.type === "folder") out.push(...collectChanges(node.children));
    else if (node.change) out.push({ path: node.path, change: node.change });
  }
  return out;
}

const TEST_OUTPUT: Line[] = [
  { text: "$ vitest run", tone: "dim" },
  { text: "✓ app/api/invites.test.ts (4 tests) 212ms", tone: "ok" },
  { text: "  ✓ createInvite issues a hashed single-use code", tone: "ok" },
  { text: "  ✓ revokeInvite flips status to REVOKED", tone: "ok" },
  { text: "  ✓ accept rejects an expired code", tone: "ok" },
  { text: "  ✓ copy-link expires with the invite", tone: "ok" },
  { text: "✓ app/api/orders.test.ts (2 tests) 96ms", tone: "ok" },
  { text: "Test Files  2 passed (2) · Tests 6 passed (6) · Duration 1.42s", tone: "ok" },
];

function execute(command: string): Line[] {
  const [cmd, ...args] = command.split(/\s+/);
  const s = store();

  switch (cmd) {
    case "help":
      return [
        { text: "Sandbox commands: ls · cat <path> · pwd · git status · npm test · node -v · clear · help", tone: "dim" },
      ];
    case "pwd":
      return [{ text: "/workspace/acme-web", tone: "out" }];
    case "ls":
      return listPaths(s.tree).map((p) => ({ text: p, tone: "out" as const }));
    case "cat": {
      if (!args[0]) return [{ text: "cat: missing path", tone: "err" }];
      const file = getFile(args[0]);
      if (!file) return [{ text: `cat: ${args[0]}: no such file`, tone: "err" }];
      return file.content
        .replace(/\n$/, "")
        .split("\n")
        .map((l) => ({ text: l, tone: "out" as const }));
    }
    case "node":
      if (args[0] === "-v" || args[0] === "--version") return [{ text: "v22.22.2", tone: "out" }];
      return [{ text: "node: only -v is available in the sandbox", tone: "err" }];
    case "git": {
      if (args[0] !== "status") return [{ text: "git: only `git status` is available in the sandbox", tone: "err" }];
      const changes = collectChanges(s.tree);
      return [
        { text: "On branch main", tone: "out" },
        { text: "Changes staged by Helix:", tone: "out" },
        ...changes.map((c) => ({
          text: `  ${c.change === "A" ? "new file" : "modified"}:   ${c.path}`,
          tone: c.change === "A" ? ("ok" as const) : ("err" as const),
        })),
      ];
    }
    case "npm":
      if (args[0] === "test" || args[0] === "t") return TEST_OUTPUT;
      return [{ text: "npm: only `npm test` is available in the sandbox", tone: "err" }];
    default:
      return [{ text: `${cmd}: command not found (sandbox allowlist — try \`help\`)`, tone: "err" }];
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid command" }, { status: 400 });

  return Response.json({ lines: execute(parsed.data.command) });
}
