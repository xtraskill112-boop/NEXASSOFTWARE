export const dynamic = "force-static";
import type { MetadataRoute } from "next";

/** Lets the console be installed, and lets the NAAMDEV Admin Android app recognise this site ("console"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NAAMDEV Console",
    short_name: "NAAMDEV Admin",
    description: "Staff console for NAAMDEV SWEETS: orders, kitchen, stock, products and reports.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#6E1528",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
