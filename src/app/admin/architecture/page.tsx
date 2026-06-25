import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { ARCHITECTURE_DOCS } from "@/lib/architecture-docs";
import { ArchitectureViewer } from "./architecture-viewer";

export const metadata = { title: "Helix · Admin · Architecture", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminArchitecturePage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-eyebrow hover:text-accent">
          ← Admin
        </Link>
        <h1 className="text-h1 mt-1">System architecture</h1>
        <p className="mt-1 text-[13px] text-txt3">
          {ARCHITECTURE_DOCS.length} living docs &amp; diagrams, bundled from <code>docs/</code> on every deploy — edit
          the source in the repo and they update here automatically. Written to be understandable by non-engineers.
        </p>
      </header>

      <ArchitectureViewer docs={ARCHITECTURE_DOCS} />
    </div>
  );
}
