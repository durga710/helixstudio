import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db, dbEnabled } from "@/lib/db";
import { getAllTemplates } from "@/lib/templates/store";
import { Row } from "../ui";

export const metadata = { title: "Helix · Admin · Templates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const templates = await getAllTemplates();

  // Best-effort DB metadata (source / refresh state / refreshedAt).
  const meta: Record<string, { source: string; refreshState: string | null; refreshedAt: Date | null }> = {};
  if (dbEnabled()) {
    try {
      const rows = await db().template.findMany({
        select: { templateId: true, source: true, refreshState: true, refreshedAt: true },
      });
      for (const r of rows) meta[r.templateId] = r;
    } catch {
      /* ignore */
    }
  }

  const ids = Object.keys(templates).sort();
  const totalFiles = ids.reduce((n, id) => n + templates[id].files.length, 0);

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-[12px] text-txt3 hover:text-accent">
          ← Admin
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-txt">Stored templates</h1>
        <p className="mt-1 text-[13px] text-txt3">
          The {ids.length} scaffold starters currently in the database (or the bundle fallback) — exactly what gets
          injected into new from-scratch projects. {totalFiles} files total.
        </p>
      </header>

      <div className="space-y-5">
        {ids.map((id) => {
          const t = templates[id];
          const m = t.manifest;
          const md = meta[id];
          return (
            <section key={id} className="rounded-card-lg border border-border bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-txt">{m.label}</h2>
                <code className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-accent">{m.id}</code>
                <span className="ml-auto text-[11px] text-txt3">
                  {(md?.source ?? "bundle") === "refresh" ? "refreshed" : "bundled"}
                  {md?.refreshState ? ` · ${md.refreshState}` : ""}
                  {md?.refreshedAt ? ` · ${new Date(md.refreshedAt).toLocaleDateString()}` : ""}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-txt2">{m.description}</p>

              <div className="mt-3">
                <Row k="framework" v={m.framework} />
                <Row k="cli" v={m.cli} />
                <Row k="keywords" v={m.keywords.join(", ")} />
                <Row k="files" v={String(t.files.length)} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-txt3">
                <span className="text-txt2">notes seed:</span> {m.notesBlurb}
              </p>

              <details className="mt-3">
                <summary className="cursor-pointer select-none text-[12px] font-medium text-txt2 hover:text-txt">
                  {t.files.length} files
                </summary>
                <div className="mt-2 space-y-1.5">
                  {t.files.map((f) => (
                    <details key={f.path} className="rounded-lg border border-border bg-bg2">
                      <summary className="cursor-pointer select-none px-3 py-1.5 font-mono text-[11.5px] text-txt2 hover:text-txt">
                        {f.path} <span className="text-txt3">· {f.content.length} chars</span>
                      </summary>
                      <pre className="scroll-area max-h-96 overflow-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed text-txt2">
                        {f.content}
                      </pre>
                    </details>
                  ))}
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
