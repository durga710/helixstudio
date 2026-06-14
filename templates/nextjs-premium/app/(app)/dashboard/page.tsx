"use client";

// Dashboard — the app's home. The stat cards, the data table, and the "main
// feature" region are placeholders: relabel/replace them with the user's real app.
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Plus } from "lucide-react";
import { FadeIn } from "@/components/fade-in";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";

type Member = { name: string; email: string; role: string; status: "active" | "invited" };

// AI: replace this sample with the user's real data (from an API / DB).
const MEMBERS: Member[] = [
  { name: "Ada Lovelace", email: "ada@example.com", role: "Owner", status: "active" },
  { name: "Alan Turing", email: "alan@example.com", role: "Admin", status: "active" },
  { name: "Grace Hopper", email: "grace@example.com", role: "Editor", status: "invited" },
  { name: "Katherine Johnson", email: "katherine@example.com", role: "Viewer", status: "active" },
];

const columns: ColumnDef<Member>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button variant="ghost" className="-ml-3 h-8 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
  },
  { accessorKey: "email", header: "Email", cell: ({ row }) => <span className="text-muted">{row.original.email}</span> },
  { accessorKey: "role", header: "Role" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "active" ? "success" : "secondary"}>{row.original.status}</Badge>
    ),
  },
];

export default function DashboardPage() {
  return (
    <FadeIn className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-muted">Here&apos;s what&apos;s happening today.</p>
        </div>
        <Button>
          <Plus /> New item
        </Button>
      </div>

      {/* AI: relabel these for the app's real metrics (or remove). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total", value: "1,248", hint: "+12% this week" },
          { label: "Active", value: "312", hint: "+4% this week" },
          { label: "Pending", value: "27", hint: "3 need review" },
          { label: "Revenue", value: "$8.4k", hint: "+18% this month" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted">{s.label}</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{s.value}</p>
              <p className="mt-1 text-xs text-muted">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI: BUILD THE APP'S MAIN FEATURE HERE — this data table is the pattern.
          Replace the columns + data with the user's real records; reuse DataTable,
          Card, Button, Badge from components/ui/*. */}
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={MEMBERS} filterKey="name" filterPlaceholder="Filter by name…" />
        </CardContent>
      </Card>
    </FadeIn>
  );
}
