import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { CartBar } from "./cart-bar";
import { Footer } from "./footer";
import { Header } from "./header";

export function ShopShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
      <Header />
      <main id="main" className="min-h-[60dvh]">{children}</main>
      <Footer />
      <CartBar />
      <BottomNav />
    </>
  );
}
