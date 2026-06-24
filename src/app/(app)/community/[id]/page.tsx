import { after } from "next/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getPostDetail, recordView } from "@/lib/community";
import { PostDetailView } from "@/components/community/post-detail";

export const dynamic = "force-dynamic";

export default async function CommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const post = await getPostDetail(id, viewerId);
  if (!post) notFound();

  // Count one view per viewer per 30s — after render so it never blocks the page.
  if (viewerId) {
    after(async () => {
      const rl = await rateLimit(`community.view:${id}:${viewerId}`, { limit: 1, windowMs: 30_000 });
      if (rl.success) await recordView(id);
    });
  }

  return (
    <div className="pad-screen">
      <PostDetailView post={post} />
    </div>
  );
}
