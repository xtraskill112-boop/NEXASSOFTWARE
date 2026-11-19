export const dynamic = "force-static";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NAAMDEV SWEETS",
    short_name: "NAAMDEV",
    description: "Fresh Indian sweets, gift hampers and namkeen delivered to your door.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFBF3",
    theme_color: "#8F1D34",
    orientation: "portrait",
    categories: ["food", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
