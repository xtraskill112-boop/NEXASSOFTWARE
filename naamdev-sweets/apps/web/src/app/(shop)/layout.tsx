import { ShopShell } from "@/components/layout/shop-shell";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <ShopShell>{children}</ShopShell>;
}
