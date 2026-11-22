import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

// Fonts are self-hosted from npm (Fontsource) so builds never depend on reaching Google Fonts.
// Geist for all Latin text; Mukta (Indian Type Foundry) for Devanagari.
const geist = localFont({ src: "../../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", variable: "--font-geist", display: "swap", weight: "100 900" });

// Self-hosted from npm (Fontsource): builds never depend on reaching Google Fonts.

export const metadata: Metadata = {
  title: { default: "NAAMDEV Console", template: "%s · NAAMDEV Console" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.png", apple: "/icons/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
