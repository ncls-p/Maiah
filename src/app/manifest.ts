import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maiah",
    short_name: "Maiah",
    description:
      "Build, configure, and run AI agents with multi-provider support and team collaboration.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4fafc",
    theme_color: "#0d879b",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/maiah-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/maiah-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/maiah-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
