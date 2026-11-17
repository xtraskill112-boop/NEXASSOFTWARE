import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

// Self-hosted from npm (Fontsource): builds never depend on reaching Google Fonts.
const fraunces = localFont({ src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", variable: "--font-fraunces", display: "swap", weight: "100 900" });
const jakarta = localFont({ src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2", variable: "--font-jakarta", display: "swap", weight: "200 800" });

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
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${jakarta.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
