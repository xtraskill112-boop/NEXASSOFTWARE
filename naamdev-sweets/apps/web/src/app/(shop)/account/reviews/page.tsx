"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, EmptyState, Skeleton, Stars } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { ProductImage } from "@/components/common/product-image";
import { api, errorMessage } from "@/lib/api";

interface R { id: string; rating: number; title: string | null; body: string | null; status: string; rejectionReason: string | null; createdAt: string; product: { name: string; slug: string; images: { url: string }[] } }

export default function MyReviewsPage() {
  const [list, setList] = useState<R[] | null>(null);
  const load = () => api.get<{ reviews: R[] }>("/reviews/mine").then((r) => setList(r.reviews));
  useEffect(() => { void load(); }, []);
  return (
    <div className="max-w-3xl">
      <PageTitle title="My reviews" subtitle="Rate delivered items from your order page" />
      {!list ? <Skeleton className="h-40" /> : list.length === 0 ? <EmptyState icon={<Star className="h-8 w-8" />} title="No reviews yet" description="After delivery, rate your sweets from the order page." /> : (
        <div className="space-y-3">
          {list.map((r) => (
            <Card key={r.id} className="flex gap-4 p-4">
              <Link href={`/product/${r.product.slug}`}><ProductImage src={r.product.images[0]?.url ?? null} alt={r.product.name} className="h-16 w-16 rounded-2xl" sizes={128} /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{r.product.name}</p><Badge tone={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>{r.status === "PENDING" ? "In review" : r.status.toLowerCase()}</Badge></div>
                <Stars value={r.rating} size={14} className="mt-1" />
                {r.title && <p className="mt-1 text-sm font-semibold text-ink">{r.title}</p>}
                {r.body && <p className="text-sm text-ink-soft">{r.body}</p>}
                {r.rejectionReason && <p className="mt-1 text-xs text-maroon-600">{r.rejectionReason}</p>}
              </div>
              <button type="button" aria-label="Delete review" className="self-start rounded-lg p-2 text-muted hover:bg-maroon-50 hover:text-maroon-700" onClick={async () => { try { await api.del(`/reviews/${r.id}`); toast.success("Review deleted"); void load(); } catch (e) { toast.error(errorMessage(e)); } }}><Trash2 className="h-4 w-4" /></button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
