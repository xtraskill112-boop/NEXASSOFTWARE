"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import type { AppNotification, Paged } from "@naamdev/api-client";
import { Button, Card, EmptyState, Pagination, Skeleton, cn } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { enablePush, pushSupported } from "@/lib/push";

export default function NotificationsPage() {
  const { setUnread } = useRealtime();
  const [page, setPage] = useState(1);
  const [d, setD] = useState<(Paged<AppNotification> & { unread: number }) | null>(null);
  const [pushState, setPushState] = useState<string | null>(null);
  const load = () => api.get<Paged<AppNotification> & { unread: number }>("/account/notifications", { query: { page } }).then((r) => { setD(r); setUnread(r.unread); });
  useEffect(() => { void load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  const markAll = async () => { await api.post("/account/notifications/read", {}); void load(); };
  return (
    <div className="max-w-3xl">
      <PageTitle title="Notifications" action={<div className="flex gap-2">{pushSupported() && <Button variant="soft" size="sm" onClick={async () => setPushState(await enablePush())}><BellRing className="h-4 w-4" />Enable push</Button>}<Button variant="outline" size="sm" onClick={markAll}><CheckCheck className="h-4 w-4" />Mark all read</Button></div>} />
      {pushState && <p className="mb-4 rounded-xl bg-surface-2 px-4 py-2 text-sm text-ink-soft">{pushState}</p>}
      {!d ? <Skeleton className="h-60" /> : d.items.length === 0 ? <EmptyState icon={<Bell className="h-8 w-8" />} title="You're all caught up" description="Order updates and offers will appear here." /> : (
        <Card className="divide-y divide-line-soft">
          {d.items.map((n) => {
            const body = (
              <div className={cn("flex gap-3 px-5 py-4", !n.readAt && "bg-saffron-50/50 dark:bg-saffron-500/5")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-saffron-500")} />
                <div className="min-w-0 flex-1"><p className="font-semibold text-ink">{n.title}</p><p className="text-sm text-ink-soft">{n.body}</p><p className="mt-1 text-xs text-muted">{new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div>
              </div>
            );
            return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-surface-2">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </Card>
      )}
      {d && <Pagination page={page} totalPages={d.meta.totalPages} onChange={setPage} className="mt-4" />}
    </div>
  );
}
