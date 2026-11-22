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
        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 md:hidden no-print">
          <Link href="/cart" className="flex items-center justify-between rounded-xl bg-go-600 px-4 py-3 text-white shadow-lift">
            <span className="flex items-center gap-3">
              <motion.span key={bump} animate={bump ? { scale: [1, 1.15, 1] } : undefined} transition={{ duration: 0.25 }}><ShoppingBag className="h-5 w-5" /></motion.span>
              <span className="leading-tight">
                <span className="block text-[13px] font-semibold">{count} item{count > 1 ? "s" : ""} added</span>
                <span className="block text-[12px] text-white/85 tabular-nums">{formatINR(cart?.pricing.totalPaise ?? 0)}</span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-[15px] font-bold">View Cart <ChevronRight className="h-4 w-4" /></span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
