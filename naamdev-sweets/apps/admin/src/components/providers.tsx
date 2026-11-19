"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AdminAuthProvider } from "@/lib/auth";
import { AdminRealtimeProvider } from "@/lib/realtime";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AdminAuthProvider>
        <AdminRealtimeProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </AdminRealtimeProvider>
      </AdminAuthProvider>
    </ThemeProvider>
  );
}
