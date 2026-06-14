import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// AI: set the product name + description for the user's app.
export const metadata: Metadata = {
  title: "Helix App",
  description: "A premium app.",
};

// HELIX-LOCKED: applies the saved palette before paint (no theme flash / no
// hydration mismatch — React doesn't render data-theme, this script sets it).
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('theme')||'midnight'}catch(e){document.documentElement.dataset.theme='midnight'}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
