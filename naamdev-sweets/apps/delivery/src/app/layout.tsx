import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

// Fonts are self-hosted from npm (Fontsource) so builds never depend on reaching Google Fonts.
// Outfit for all Latin text; Mukta (Indian Type Foundry) for Devanagari.
const outfit = localFont({ src: [{ path: "../../node_modules/@fontsource/outfit/files/outfit-latin-400-normal.woff2", weight: "400" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-500-normal.woff2", weight: "500" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-600-normal.woff2", weight: "600" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-700-normal.woff2", weight: "700" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-800-normal.woff2", weight: "800" }], variable: "--font-outfit", display: "swap" });

// Self-hosted from npm (Fontsource): builds never depend on reaching Google Fonts.

export const metadata: Metadata = {
  title: { default: "NAAMDEV Partner", template: "%s · NAAMDEV Partner" },
  description: "Delivery partner app for NAAMDEV SWEETS",
  manifest: "/manifest.webmanifest",
  robots: { index: false },
  icons: { icon: "/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NAAMDEV Partner", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#6E1528", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
