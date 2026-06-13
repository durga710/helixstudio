"use client";

import Link from "next/link";

/**
 * App-level error boundary — any uncaught render/action error renders this
 * styled fallback instead of the bare framework error screen. No stack leak.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[70vh] place-items-center bg-[#070b12] px-6 text-center text-[#f8fbff]">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#9cadc4]">
          An unexpected error occurred. Try again, or head back home — your work is saved.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-[10px] bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-[10px] border border-[#28364f] px-4 py-2 text-sm text-[#9cadc4] transition-colors hover:border-accent hover:text-[#f8fbff]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
