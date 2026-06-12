"use client";

import { ShellProvider } from "./shell-context";
import { Rail } from "./rail";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { NewProjectModal } from "./new-project-modal";

export function AppShell({
  userInitials,
  userImage,
  children,
}: {
  userInitials: string;
  userImage?: string | null;
  children: React.ReactNode;
}) {
  return (
    <ShellProvider>
      {/* grid-rows-1 → grid-template-rows: minmax(0,1fr): pins the single row to
          the screen height so it can't grow with content. Without it a tall page
          (e.g. the editor's big file tree) expands this row past the viewport;
          overflow-hidden then clips everything below the fold with no scroll,
          which made the editor's chat panel look empty. With the row pinned,
          <main> stays viewport-height and scrolls its own content. */}
      <div className="grid h-screen grid-cols-[56px_1fr] grid-rows-1 overflow-hidden">
        <Rail userInitials={userInitials} userImage={userImage} />
        <div className="flex min-w-0 flex-col">
          <Topbar />
          <main className="scroll-area min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
      <CommandPalette />
      <NewProjectModal />
    </ShellProvider>
  );
}
