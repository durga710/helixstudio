import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createInvite, revokeInvite, setMemberRole, store } from "@/lib/store";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string().email().max(200) }),
  z.object({ action: z.literal("revoke"), inviteId: z.string().min(1) }),
  z.object({
    action: z.literal("setRole"),
    memberId: z.string().min(1),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
  }),
]);

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { members, invites, audit } = store();
  return Response.json({ members, invites, audit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid team action" }, { status: 400 });

  const actor = session.user.name ?? session.user.email ?? "user";
  const data = parsed.data;

  if (data.action === "invite") {
    return Response.json({ invite: createInvite(data.email, actor) }, { status: 201 });
  }
  if (data.action === "revoke") {
    const invite = revokeInvite(data.inviteId, actor);
    if (!invite) return Response.json({ error: "Invite not found" }, { status: 404 });
    return Response.json({ invite });
  }
  const member = setMemberRole(data.memberId, data.role, actor);
  if (!member) return Response.json({ error: "Cannot change this member's role" }, { status: 400 });
  return Response.json({ member });
}
