import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server output — bundled into the desktop app (see docs/DESKTOP.md).
  // Vercel uses its own build output, so production hosting is unaffected.
  output: "standalone",
  async redirects() {
    return [
      // Canonical domain: www.helixstudio.org -> helixstudio.org (backstop for the
      // Vercel dashboard redirect; harmless on previews where the host won't match).
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.helixstudio.org" }],
        destination: "https://helixstudio.org/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
