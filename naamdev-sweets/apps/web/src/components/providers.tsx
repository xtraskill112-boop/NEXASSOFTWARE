"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { I18nProvider } from "@/lib/i18n";
import { LocationProvider } from "@/lib/location";
import { RealtimeProvider } from "@/lib/realtime";
import { SettingsProvider } from "@/lib/settings";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SettingsProvider>
        <I18nProvider>
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
