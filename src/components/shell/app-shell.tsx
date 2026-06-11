"use client";

import { ShellProvider } from "./shell-context";
import { Rail } from "./rail";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { NewProjectModal } from "./new-project-modal";

export function AppShell({
  userInitials,
  children,
}: {
  userInitials: string;
  children: React.ReactNode;
}) {
  return (
    <ShellProvider>
      <div className="grid h-screen grid-cols-[56px_1fr] overflow-hidden">
        <Rail userInitials={userInitials} />
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
