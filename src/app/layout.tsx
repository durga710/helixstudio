import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { themeInitScript } from "@/lib/theme-init";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helixstudio.org";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Helix Studio — AI Coding Platform",
    template: "%s — Helix Studio",
  },
  description:
    "One unified system for building, reviewing, and shipping software. Five specialist agents collaborate on every task.",
  openGraph: {
    siteName: "Helix Studio",
    url: appUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-density="comfortable"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {/* Theme init must execute before first paint, but a <script> element
            rendered through React triggers a React 19 console error whenever
            the tree re-renders on the client (scripts are never executed
            there). Injecting the tag via innerHTML keeps it out of React's
            element creation entirely: the browser parser executes it from the
            server HTML, and client re-renders are a no-op. */}
        <div hidden dangerouslySetInnerHTML={{ __html: `<script>${themeInitScript}</script>` }} />
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
