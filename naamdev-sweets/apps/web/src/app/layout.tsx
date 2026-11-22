import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SplashScreen } from "@naamdev/ui";
import { Providers } from "@/components/providers";
import { SITE_URL } from "@/lib/api";
import "./globals.css";

// Fonts are self-hosted from npm (Fontsource) so builds never depend on reaching Google Fonts.
// Outfit for all Latin text; Mukta (Indian Type Foundry) for Devanagari.
const outfit = localFont({ src: [{ path: "../../node_modules/@fontsource/outfit/files/outfit-latin-400-normal.woff2", weight: "400" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-500-normal.woff2", weight: "500" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-600-normal.woff2", weight: "600" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-700-normal.woff2", weight: "700" }, { path: "../../node_modules/@fontsource/outfit/files/outfit-latin-800-normal.woff2", weight: "800" }], variable: "--font-outfit", display: "swap" });
const muktaDeva = localFont({ src: [{ path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-400-normal.woff2", weight: "400" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-500-normal.woff2", weight: "500" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-600-normal.woff2", weight: "600" }, { path: "../../node_modules/@fontsource/mukta/files/mukta-devanagari-700-normal.woff2", weight: "700" }], variable: "--font-mukta-deva", display: "swap", preload: false });


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "NAAMDEV SWEETS — Fresh Indian Sweets, Delivered", template: "%s | NAAMDEV SWEETS" },
  description: "Order fresh kaju katli, laddu, rasgulla, gift hampers and namkeen online. Made daily with pure desi ghee and delivered in sealed boxes.",
  applicationName: "NAAMDEV SWEETS",
  keywords: ["indian sweets", "mithai online", "kaju katli", "laddu", "gift hampers", "sweets delivery", "Jaipur sweets"],
  icons: { icon: [{ url: "/favicon.png", type: "image/png" }, { url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: "NAAMDEV SWEETS", locale: "en_IN", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
  appleWebApp: { capable: true, title: "NAAMDEV", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FFFFFF" }, { media: "(prefers-color-scheme: dark)", color: "#121214" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Bakery",
    name: "NAAMDEV SWEETS",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}/og-image.png`,
    servesCuisine: "Indian sweets",
    priceRange: "₹₹",
    potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/search?q={query}`, "query-input": "required name=query" },
  };
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${muktaDeva.variable}`}>
      <body className="min-h-dvh">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, "\\u003c") }} />
        <Providers>
          <SplashScreen />
          {children}
        </Providers>
      </body>
    </html>
  );
}
