"use client";

/**
 * Global error boundary — catches errors in the root layout itself (where the
 * normal error.tsx can't render). Must include <html>/<body>. No stack leak.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#070b12", color: "#f8fbff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "grid", minHeight: "100vh", placeItems: "center", textAlign: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
            <p style={{ marginTop: ".5rem", color: "#9cadc4", fontSize: ".9rem" }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "1rem",
                background: "#3b82f6",
                color: "#fff",
                border: 0,
                borderRadius: 10,
                padding: ".55rem 1.1rem",
                fontSize: ".9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
