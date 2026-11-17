"use client";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@naamdev/ui";
import { useAuth } from "@/lib/auth";

export function WishlistButton({ productId, name, className, size = "md" }: { productId: string; name: string; className?: string; size?: "sm" | "md" }) {
  const { wishlist, toggleWishlist } = useAuth();
  const on = wishlist.has(productId);
  return (
    <button
      type="button"
      aria-label={on ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleWishlist(productId, name);
      }}
      className={cn("grid place-items-center rounded-full bg-white/85 text-maroon-700 shadow-sm backdrop-blur transition hover:scale-110 dark:bg-black/40 dark:text-maroon-300", size === "sm" ? "h-8 w-8" : "h-10 w-10", className)}
    >
      <motion.span key={String(on)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
        <Heart className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} fill={on ? "currentColor" : "none"} />
      </motion.span>
    </button>
  );
}
