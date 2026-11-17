"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PartnerProvider } from "@/lib/partner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <PartnerProvider>
        {children}
        <Toaster position="top-center" richColors />
      </PartnerProvider>
    </ThemeProvider>
  );
}
