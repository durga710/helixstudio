import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand";

/**
 * Shared chrome for the static legal pages (Terms, Privacy). Plain prose in a
 * readable measure, brand header, back-to-home link. Kept dependency-free so a
 * signed-out visitor can read it without any app code loading.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070b12] text-[#e7edf6]">
      <header className="border-b border-[#1d2940]">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-6 py-4">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <span className="overflow-hidden rounded-[9px]">
              <BrandMark size={28} />
            </span>
            <span className="text-[14px] font-extrabold tracking-tight">
              HELIX <span className="font-semibold text-[#9cadc4]">STUDIO</span>
            </span>
          </Link>
          <Link
            href="/welcome"
            className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-[#9cadc4] transition-colors hover:text-[#f8fbff]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 py-12">
        <h1 className="text-[30px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[13px] text-[#5f6f86]">Last updated {updated}</p>
        <div className="legal-prose mt-9 space-y-6 text-[14.5px] leading-relaxed text-[#bccadb]">
          {children}
        </div>

        <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#1d2940] pt-6 text-[13px] text-[#5f6f86]">
          <Link href="/terms" className="hover:text-[#f8fbff]">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-[#f8fbff]">Privacy Policy</Link>
          <span className="ml-auto">© 2026 Helix Studio</span>
        </div>
      </main>
    </div>
  );
}

/** Section heading used inside legal prose. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[18px] font-semibold text-[#f3f7fc]">{heading}</h2>
      {children}
    </section>
  );
}
