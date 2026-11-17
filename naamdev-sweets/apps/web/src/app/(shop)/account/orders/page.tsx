"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import type { Order, Paged } from "@naamdev/api-client";
import { Button, EmptyState, Pagination, Segmented, Skeleton, buttonStyles } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { OrderCard } from "@/components/orders/order-card";
import { api } from "@/lib/api";

export default function OrdersPage() {
  const [tab, setTab] = useState<"all" | "active" | "past">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Order> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setData(null);
    api.get<Paged<Order>>("/orders", { query: { status: tab, page, pageSize: 10 } }).then(setData).catch(() => setErr(true));
  }, [tab, page]);
  return (
    <div className="max-w-3xl">
      <PageTitle title="My orders" />
      <Segmented value={tab} onChange={(v) => { setTab(v); setPage(1); }} options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "past", label: "Past" }]} className="mb-5" />
      {err ? <Button onClick={() => location.reload()}>Retry</Button> : !data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={<Package className="h-8 w-8" />} title="No orders here yet" description="Your sweet journeys will show up here." action={<Link href="/" className={buttonStyles()}>Start shopping</Link>} />
      ) : (
        <div className="space-y-4">
          {data.items.map((o) => <OrderCard key={o.id} order={o} />)}
          <Pagination page={page} totalPages={data.meta.totalPages} onChange={setPage} className="pt-2" />
        </div>
      )}
    </div>
  );
}
