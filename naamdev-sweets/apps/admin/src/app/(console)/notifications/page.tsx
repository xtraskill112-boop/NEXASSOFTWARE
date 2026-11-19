"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Card, EmptyState } from "@naamdev/ui";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { api, dt } from "@/lib/api";
import { useAdminRealtime } from "@/lib/realtime";
import { useResource } from "@/lib/use-resource";

export default function StaffNotifications() {
  const { setUnread } = useAdminRealtime();
  const { data } = useResource<{ items: { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[] }>("/admin/me/notifications");
  useEffect(() => { if (data) void api.post("/admin/me/notifications/read").then(() => setUnread(0)); }, [data, setUnread]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Alerts" subtitle="New orders, low stock, expiring batches, tickets and partner signups" />
      {data && data.items.length === 0 ? <EmptyState icon={<Bell className="h-7 w-7" />} title="No alerts yet" /> : (
        <Card className="divide-y divide-line-soft">{data?.items.map((n) => {
          const inner = <div className="px-5 py-4"><p className={n.readAt ? "font-semibold text-ink" : "font-bold text-ink"}>{n.title}</p><p className="text-sm text-ink-soft">{n.body}</p><p className="mt-1 text-xs text-muted">{dt(n.createdAt)}</p></div>;
          return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-surface-2">{inner}</Link> : <div key={n.id}>{inner}</div>;
        })}</Card>
      )}
    </div>
  );
}
