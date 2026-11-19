import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SplashScreen } from "@naamdev/ui";
import { Providers } from "@/components/providers";
import { SITE_URL } from "@/lib/api";
import "./globals.css";

// Fonts are self-hosted from npm (Fontsource) so builds never depend on reaching Google Fonts.
const fraunces = localFont({ src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-standard-normal.woff2", variable: "--font-fraunces", display: "swap", weight: "100 900" });
const jakarta = localFont({ src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2", variable: "--font-jakarta", display: "swap", weight: "200 800" });
const deva = localFont({ src: "../../node_modules/@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2", variable: "--font-devanagari", display: "swap", weight: "100 900" });

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
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FFFBF3" }, { media: "(prefers-color-scheme: dark)", color: "#120A0B" }],
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
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${jakarta.variable} ${deva.variable}`}>
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
