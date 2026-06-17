import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helixstudio.org";

/* Public, indexable pages only — the authenticated app is excluded (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${appUrl}/welcome`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/build`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${appUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${appUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
