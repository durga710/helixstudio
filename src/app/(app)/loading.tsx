/**
 * Instant route-transition skeleton for every (app) page. The shell (rail +
 * topbar) lives in the layout and stays mounted; this paints the content
 * area immediately while the page's server work streams in — navigation
 * feels instant instead of frozen.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-[1800px] animate-pulse px-6 py-6" aria-busy="true" aria-label="Loading page">
      <div className="h-7 w-52 rounded-lg bg-panel2" />
      <div className="mt-2 h-4 w-80 rounded bg-panel2/70" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-card-lg border border-border bg-panel p-4">
            <div className="h-3 w-16 rounded bg-panel2" />
            <div className="mt-3 h-6 w-12 rounded bg-panel2" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="h-4 w-32 rounded bg-panel2" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-card-lg border border-border bg-panel" />
            ))}
          </div>
        </div>
        <div>
          <div className="h-4 w-24 rounded bg-panel2" />
          <div className="mt-3 h-72 rounded-card-lg border border-border bg-panel" />
        </div>
      </div>
    </div>
  );
}
