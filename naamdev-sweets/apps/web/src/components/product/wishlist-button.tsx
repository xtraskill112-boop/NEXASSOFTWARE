"use client";
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
      className={cn("grid place-items-center rounded-full bg-white text-ink-soft transition-colors hover:text-maroon-700 aria-pressed:text-maroon-700 dark:bg-black/60 dark:text-cream-100", size === "sm" ? "h-8 w-8" : "h-10 w-10", className)}
    >
      <Heart className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
