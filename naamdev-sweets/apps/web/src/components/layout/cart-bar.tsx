"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { formatINR } from "@naamdev/shared";
import { useCart } from "@/lib/cart";

/** Floating "View cart" bar (mobile), Swiggy-style, sits above the bottom navigation. */
export function CartBar() {
  const { count, cart, bump } = useCart();
  const pathname = usePathname();
  const hidden = ["/cart", "/checkout", "/login", "/account/orders"].some((p) => pathname.startsWith(p)) || pathname.startsWith("/product/");
  const show = count > 0 && !hidden;
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 md:hidden no-print">
          <Link href="/cart" className="nd-gradient-saffron flex items-center justify-between rounded-2xl px-4 py-3 text-white shadow-glow">
            <span className="flex items-center gap-3">
              <motion.span key={bump} animate={{ rotate: [0, -12, 12, 0] }} className="grid h-9 w-9 place-items-center rounded-xl bg-white/20"><ShoppingBag className="h-5 w-5" /></motion.span>
              <span className="leading-tight">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/80">{count} item{count > 1 ? "s" : ""} added</span>
                <span className="block text-base font-bold">{formatINR(cart?.pricing.totalPaise ?? 0)}</span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-sm font-bold">View cart <ChevronRight className="h-4 w-4" /></span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
