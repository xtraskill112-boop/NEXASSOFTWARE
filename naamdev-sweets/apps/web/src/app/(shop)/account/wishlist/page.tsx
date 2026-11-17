"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import type { ProductCard } from "@naamdev/api-client";
import { EmptyState, Skeleton, buttonStyles } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { ProductGrid } from "@/components/product/product-rail";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function WishlistPage() {
  const { wishlist } = useAuth();
  const [items, setItems] = useState<ProductCard[] | null>(null);
  useEffect(() => { api.get<{ items: ProductCard[] }>("/account/wishlist").then((r) => setItems(r.items)); }, []);
  const visible = items?.filter((p) => wishlist.has(p.id));
  return (
    <div>
      <PageTitle title="Wishlist" subtitle="Sweets you’ve saved for later cravings" />
      {!visible ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square" />)}</div> : visible.length === 0 ? (
        <EmptyState icon={<Heart className="h-8 w-8" />} title="Your wishlist is empty" description="Tap the heart on any sweet to save it here." action={<Link href="/" className={buttonStyles()}>Discover sweets</Link>} />
      ) : <ProductGrid products={visible} className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 xl:grid-cols-4" />}
    </div>
  );
}
