import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helixstudio.org";

/* Crawlers may index the public marketing/legal surface; the signed-in app,
 * API, and per-workspace routes are private and should never be crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/editor", "/build/", "/settings", "/team", "/space", "/login", "/signup"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
