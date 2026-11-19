"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import type { PublicSettings } from "@naamdev/api-client";
import type { Locale } from "@naamdev/shared/i18n";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { I18nProvider } from "@/lib/i18n";
import { LocationProvider } from "@/lib/location";
import { RealtimeProvider } from "@/lib/realtime";
import { SettingsProvider } from "@/lib/settings";

export function Providers({ children, locale, settings }: { children: ReactNode; locale: Locale; settings: PublicSettings | null }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SettingsProvider value={settings}>
        <I18nProvider initialLocale={locale}>
          <AuthProvider>
            <LocationProvider>
              <CartProvider>
                <RealtimeProvider>
                  {children}
                  <Toaster position="top-center" richColors closeButton toastOptions={{ className: "!rounded-2xl !font-sans" }} />
                </RealtimeProvider>
              </CartProvider>
            </LocationProvider>
          </AuthProvider>
        </I18nProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
