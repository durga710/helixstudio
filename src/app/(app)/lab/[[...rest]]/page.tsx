import { redirect } from "next/navigation";

/* The AI Lab was renamed to AI Academy. Permanently send any old /lab/* link
 * (bookmarks, classroom deep-links, prefetches) to the new /academy/* home. */
export const dynamic = "force-dynamic";

export default async function LabRedirect({
  params,
}: {
  params: Promise<{ rest?: string[] }>;
}) {
  const { rest } = await params;
  const tail = rest?.length ? `/${rest.join("/")}` : "";
  redirect(`/academy${tail}`);
}
