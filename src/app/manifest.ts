import type { MetadataRoute } from "next";

/* PWA / install metadata. Icons reuse the brand mark already in /public/brand. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Helix Studio",
    short_name: "Helix",
    description:
      "Describe an app and watch Helix build it — with a live preview, repo import, and one-click deploy.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b12",
    theme_color: "#070b12",
    icons: [
      { src: "/brand/circuit-core-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/circuit-core-favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
