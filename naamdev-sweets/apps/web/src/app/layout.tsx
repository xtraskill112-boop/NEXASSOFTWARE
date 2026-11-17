import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { cookies } from "next/headers";
import type { PublicSettings } from "@naamdev/api-client";
import { SplashScreen } from "@naamdev/ui";
import { Providers } from "@/components/providers";
import { SITE_URL } from "@/lib/api";
import { fetchPublic } from "@/lib/server-api";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz", "SOFT"] });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", display: "swap", weight: ["400", "500", "600", "700"] });

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale = jar.get("nd_lang")?.value === "hi" ? "hi" : "en";
  const settings = await fetchPublic<PublicSettings>("/public/settings", 60);
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Bakery",
    name: "NAAMDEV SWEETS",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}/og-image.png`,
    telephone: settings?.storeProfile.phone || undefined,
    address: settings?.storeProfile.address || undefined,
    servesCuisine: "Indian sweets",
    priceRange: "₹₹",
    potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/search?q={query}`, "query-input": "required name=query" },
  };
  return (
    <html lang={locale} suppressHydrationWarning className={`${fraunces.variable} ${jakarta.variable} ${deva.variable}`}>
      <body className="min-h-dvh">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, "\\u003c") }} />
        <Providers locale={locale} settings={settings}>
          <SplashScreen />
          {children}
        </Providers>
      </body>
    </html>
  );
}
