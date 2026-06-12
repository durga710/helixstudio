/**
 * Editor-shaped skeleton: chat column + workspace column paint instantly
 * while the workspace row loads, so opening a project never shows a blank
 * content area.
 */
export default function EditorLoading() {
  return (
    <div className="mx-auto h-full min-h-0 max-w-[1800px] px-4 py-4" aria-busy="true" aria-label="Loading workspace">
      <div className="grid h-full min-h-0 animate-pulse grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
        <div className="flex min-h-0 flex-col rounded-card-lg border border-border bg-panel">
          <div className="border-b border-border px-4 py-3">
            <div className="h-4 w-28 rounded bg-panel2" />
          </div>
          <div className="flex-1 space-y-3 p-4">
            <div className="h-12 w-3/4 rounded-card-lg bg-panel2/70" />
            <div className="ml-auto h-10 w-2/3 rounded-card-lg bg-panel2/50" />
            <div className="h-16 w-4/5 rounded-card-lg bg-panel2/70" />
          </div>
          <div className="border-t border-border p-3">
            <div className="h-10 rounded-card-lg bg-panel2/70" />
          </div>
        </div>
        <div className="flex min-h-0 flex-col rounded-card-lg border border-border bg-panel">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="h-4 w-40 rounded bg-panel2" />
            <div className="ml-auto h-7 w-44 rounded-lg bg-panel2/70" />
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="w-60 shrink-0 space-y-2 border-r border-border p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-4 rounded bg-panel2/70" style={{ width: `${85 - (i % 4) * 12}%` }} />
              ))}
            </div>
            <div className="flex-1 space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-3.5 rounded bg-panel2/50" style={{ width: `${90 - ((i * 13) % 45)}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
