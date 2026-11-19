"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { watchLive } from "@naamdev/api-client/firebase";
import { formatINR } from "@naamdev/shared";
import { api } from "./api";
import { useAdmin } from "./auth";

const Ctx = createContext<{ unread: number; setUnread: (n: number) => void; tick: number }>({ unread: 0, setUnread: () => undefined, tick: 0 });

/** Plays a short two-tone chime for new orders (Web Audio — no external asset needed). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
  } catch {
    /* audio not allowed */
  }
}

/** Calls `fn` for each change of a live document after the first snapshot. */
function onChanges(collection: Parameters<typeof watchLive>[0], id: string, fn: (data: Record<string, unknown>) => void) {
  let seen: number | null = null;
  return watchLive(collection, id, (data) => {
    const v = Number(data?.version ?? 0);
    if (seen !== null && v > seen && data) fn(data);
    seen = v;
  });
}

/** Console realtime: new-order chime, live order board refresh and staff notifications (Firestore live docs). */
export function AdminRealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAdmin();
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!me) return;
    api.get<{ unread: number }>("/admin/me/notifications").then((r) => setUnread(r.unread)).catch(() => undefined);
    const stops = [
      onChanges("liveStaff", "orders", (d) => {
        const last = d.last as { event?: string; orderId?: string; orderNumber?: string; totalPaise?: number } | undefined;
        if (last?.event === "new-order" && last.orderId) {
          chime();
          toast.success(`New order ${last.orderNumber ?? ""}`, {
            description: last.totalPaise != null ? formatINR(last.totalPaise) : undefined,
            action: { label: "Open", onClick: () => (window.location.href = `/orders/${last.orderId}`) },
            duration: 10000,
          });
        }
        setTick((t) => t + 1);
      }),
      onChanges("liveUsers", me.id, (d) => {
        const last = d.last as { title?: string; body?: string } | undefined;
        setUnread((u) => u + 1);
        if (last?.title) toast(last.title, { description: last.body });
      }),
    ];
    return () => stops.forEach((s) => s());
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={{ unread, setUnread, tick }}>{children}</Ctx.Provider>;
}

export const useAdminRealtime = () => useContext(Ctx);

/** Reloads when a specific order's live signal changes (status, assignment, rider position). */
export function useOrderLive(orderId: string, reload: () => void) {
  const { me } = useAdmin();
  useEffect(() => {
    if (!me || !orderId) return;
    return onChanges("liveOrders", orderId, () => reload());
  }, [me?.id, orderId]); // eslint-disable-line react-hooks/exhaustive-deps
}
