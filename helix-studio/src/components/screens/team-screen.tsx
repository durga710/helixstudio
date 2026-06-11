"use client";

import { useState } from "react";
import { Copy, MailPlus, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { timeAgo, cn } from "@/lib/utils";
import type { AuditEvent, TeamInvite, TeamMember, TeamRole } from "@/lib/types";

const ROLES: TeamRole[] = ["ADMIN", "MEMBER", "VIEWER"];

const roleTone: Record<TeamRole, "accent" | "green" | "neutral" | "amber"> = {
  OWNER: "accent",
  ADMIN: "green",
  MEMBER: "neutral",
  VIEWER: "amber",
};

export function TeamScreen(props: {
  members: TeamMember[];
  invites: TeamInvite[];
  audit: AuditEvent[];
}) {
  const [members, setMembers] = useState(props.members);
  const [invites, setInvites] = useState(props.invites);
  const [audit, setAudit] = useState(props.audit);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const { toast } = useToast();

  async function refresh() {
    const res = await fetch("/api/team");
    if (!res.ok) return;
    const data = (await res.json()) as { members: TeamMember[]; invites: TeamInvite[]; audit: AuditEvent[] };
    setMembers(data.members);
    setInvites(data.invites);
    setAudit(data.audit);
  }

  async function act(body: object, success: string) {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast(success);
      await refresh();
      return true;
    }
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    toast(err?.error ?? "Action failed");
    return false;
  }

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    if (await act({ action: "invite", email: email.trim() }, `Invite sent to ${email.trim()}`)) {
      setEmail("");
    }
    setInviting(false);
  }

  return (
    <div className="pad-screen">
      <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Enterprise</div>
      <h1 className="text-[22px] font-bold tracking-tight">Team</h1>
      <p className="mt-1 text-[13px] text-txt2">Shared workspace, roles, invitations, and the audit log.</p>

      <div className="mt-[18px] grid grid-cols-1 gap-3.5 xl:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0">
          {/* Members */}
          <div className="mb-[11px] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Members</h3>
            <Pill tone="neutral">{members.length} seats</Pill>
          </div>
          <Card>
            {members.map((member, i) => (
              <div
                key={member.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  i < members.length - 1 && "border-b border-border"
                )}
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#8b5cf6] to-accent text-[11px] font-semibold text-white">
                  {member.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{member.name}</div>
                  <div className="truncate text-xs text-txt3">{member.email}</div>
                </div>
                <span className="hidden text-[11px] text-txt3 sm:block">joined {timeAgo(member.joinedAt)}</span>
                {member.role === "OWNER" ? (
                  <Pill tone={roleTone.OWNER}>
                    <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                    OWNER
                  </Pill>
                ) : (
                  <select
                    value={member.role}
                    aria-label={`Role for ${member.name}`}
                    onChange={(e) =>
                      act(
                        { action: "setRole", memberId: member.id, role: e.target.value },
                        `${member.name} is now ${e.target.value}`
                      )
                    }
                    className="cursor-pointer rounded-md border border-border2 bg-panel2 px-2 py-1 text-[11px] font-semibold text-txt2 outline-none focus:border-accent"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </Card>

          {/* Invites */}
          <div className="mb-[11px] mt-6 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Invitations</h3>
          </div>
          <Card className="p-4">
            <div className="mb-3 flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                placeholder="teammate@company.com"
                aria-label="Invite email"
                className="text-[12.5px]"
              />
              <Button onClick={invite} disabled={inviting || !email.includes("@")}>
                <MailPlus className="h-[15px] w-[15px]" strokeWidth={1.7} />
                Invite
              </Button>
            </div>
            {invites.length === 0 && (
              <div className="py-3 text-center text-xs text-txt3">No pending invitations.</div>
            )}
            {invites.map((inv, i) => (
              <div
                key={inv.id}
                className={cn(
                  "flex items-center gap-3 py-2.5",
                  i < invites.length - 1 && "border-b border-border"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px]">{inv.email}</div>
                  <div className="text-[10.5px] text-txt3">sent {timeAgo(inv.createdAt)}</div>
                </div>
                <code className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-txt2">{inv.code}</code>
                <Pill
                  tone={inv.status === "PENDING" ? "amber" : inv.status === "ACCEPTED" ? "green" : "red"}
                >
                  {inv.status.toLowerCase()}
                </Pill>
                {inv.status === "PENDING" && (
                  <>
                    <button
                      title="Copy invite link"
                      aria-label="Copy invite link"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(`https://helixstudio.org/accept/${inv.code}`)
                          .then(() => toast("Invite link copied"));
                      }}
                      className="cursor-pointer rounded-md p-1 text-txt3 hover:bg-panel2 hover:text-txt"
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={1.7} />
                    </button>
                    <button
                      title="Revoke invite"
                      aria-label="Revoke invite"
                      onClick={() => act({ action: "revoke", inviteId: inv.id }, "Invite revoked")}
                      className="cursor-pointer rounded-md p-1 text-txt3 hover:bg-panel2 hover:text-bad"
                    >
                      <XCircle className="h-3.5 w-3.5" strokeWidth={1.7} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </Card>
        </div>

        {/* Audit log */}
        <div className="min-w-0">
          <div className="mb-[11px] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Audit log</h3>
            <span className="text-[11.5px] text-txt3">Security compliance</span>
          </div>
          <Card>
            {audit.length === 0 && <div className="p-6 text-center text-xs text-txt3">No events yet.</div>}
            {audit.slice(0, 12).map((event, i) => (
              <div
                key={event.id}
                className={cn(
                  "px-4 py-2.5 text-[12.5px]",
                  i < Math.min(audit.length, 12) - 1 && "border-b border-border"
                )}
              >
                <span className="font-medium">{event.actor}</span>{" "}
                <span className="text-txt2">{event.action}</span>{" "}
                <span className="font-mono text-xs text-accent">{event.target}</span>
                <div className="text-[10.5px] text-txt3">{timeAgo(event.at)}</div>
              </div>
            ))}
          </Card>
          <Card className="mt-3.5 p-4">
            <h4 className="text-[12.5px] font-semibold">SSO</h4>
            <p className="mt-1 text-xs text-txt2">
              Enterprise login via SAML / OIDC plugs into Auth.js — configure your IdP&apos;s client ID and
              secret in the environment to enable it alongside GitHub and Google.
            </p>
            <Pill tone="neutral" className="mt-2.5">
              available on Enterprise
            </Pill>
          </Card>
        </div>
      </div>
    </div>
  );
}
