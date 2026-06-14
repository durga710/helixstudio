"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Toast notifications. <Toaster /> is mounted once in app/layout.tsx; call toasts
// with `import { toast } from "sonner"`.
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "group rounded-xl border border-line bg-surface text-ink shadow-lg",
          description: "text-muted",
          actionButton: "bg-brand text-brand-fg",
          cancelButton: "bg-surface2 text-ink",
        },
      }}
      {...props}
    />
  );
}
