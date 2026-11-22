import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

// Fonts are self-hosted from npm (Fontsource) so builds never depend on reaching Google Fonts.
// Martel for headings, Mukta for text — both by the Indian Type Foundry, with matching Devanagari.
const martel = localFont({ src: [{ path: "../../node_modules/@fontsource/martel/files/martel-latin-700-normal.woff2", weight: "700" }, { path: "../../node_modules/@fontsource/martel/files/martel-latin-800-normal.woff2", weight: "800" }], variable: "--font-martel", display: "swap" });
const mukta = localFont({ src: [{ path: "../../node_modules/@fontsource/mukta/files/mukta-latin-400-normal.woff2", weight: "400" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-latin-500-normal.woff2", weight: "500" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-latin-600-normal.woff2", weight: "600" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-latin-700-normal.woff2", weight: "700" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-latin-800-normal.woff2", weight: "800" }], variable: "--font-mukta", display: "swap" });

// Self-hosted from npm (Fontsource): builds never depend on reaching Google Fonts.

export const metadata: Metadata = {
  title: { default: "NAAMDEV Console", template: "%s · NAAMDEV Console" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.png", apple: "/icons/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${martel.variable} ${mukta.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
