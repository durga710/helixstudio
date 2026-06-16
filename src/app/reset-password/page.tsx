import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { ResetPasswordForm } from "@/components/screens/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b12] px-6 py-10 text-[#f8fbff]">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-3">
          <span className="overflow-hidden rounded-xl shadow-[0_6px_22px_rgba(0,0,0,0.5)]">
            <BrandMark size={46} />
          </span>
          <span className="leading-none">
            <div className="text-[21px] font-extrabold tracking-tight">HELIX</div>
            <div className="mt-[3px] text-[11px] font-semibold tracking-[0.34em] text-[#9cadc4]">STUDIO</div>
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        <p className="mt-1.5 text-sm text-[#9cadc4]">Choose a strong password you don&apos;t use elsewhere.</p>

        <ResetPasswordForm token={token ?? ""} />

        <div className="mt-6 text-center text-[13px] text-[#9cadc4]">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
