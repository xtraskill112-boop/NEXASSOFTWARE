"use client";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { Card, EmptyState, buttonStyles } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { CartLine } from "@/components/cart/cart-line";
import { useCart } from "@/lib/cart";

export default function SavedPage() {
  const { cart } = useCart();
  const saved = cart?.savedItems ?? [];
  return (
    <div className="max-w-3xl">
      <PageTitle title="Saved for later" subtitle="Items you moved out of your cart" />
      {saved.length === 0 ? (
        <EmptyState icon={<Bookmark className="h-8 w-8" />} title="Nothing saved yet" description="Use “Save for later” in your cart to keep items here." action={<Link href="/cart" className={buttonStyles()}>Go to cart</Link>} />
      ) : <Card className="px-5"><ul className="divide-y divide-line-soft">{saved.map((i) => <CartLine key={i.id} item={i} saved />)}</ul></Card>}
    </div>
  );
}
