import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbEnabled } from "@/lib/db";
import { BrandMark } from "@/components/brand";
import { ForgotPasswordForm } from "@/components/screens/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user && !session.user.isGuest) redirect("/");

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

        <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="mt-1.5 text-sm text-[#9cadc4]">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>

        {dbEnabled() ? (
          <ForgotPasswordForm />
        ) : (
          <div className="mt-6 rounded-[10px] border border-[#28364f] bg-[#0d1626] px-4 py-3.5 text-sm text-[#9cadc4]">
            Password reset comes online when the database is connected.
          </div>
        )}

        <div className="mt-6 text-center text-[13px] text-[#9cadc4]">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
