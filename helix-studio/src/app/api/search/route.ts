import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchRepo } from "@/lib/repo/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ hits: [] });
  return Response.json({ hits: searchRepo(q.slice(0, 200)) });
}
