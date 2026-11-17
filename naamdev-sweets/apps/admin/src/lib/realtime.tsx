"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { connectRealtime, type Socket } from "@naamdev/api-client";
import { SOCKET_EVENTS, formatINR } from "@naamdev/shared";
import { api, SOCKET_URL } from "./api";
import { useAdmin } from "./auth";

const Ctx = createContext<{ socket: Socket | null; unread: number; setUnread: (n: number) => void; tick: number }>({ socket: null, unread: 0, setUnread: () => undefined, tick: 0 });

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

export function AdminRealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAdmin();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!me) return;
    let s: Socket | null = null;
    let cancelled = false;
    api.get<{ unread: number }>("/admin/me/notifications").then((r) => setUnread(r.unread)).catch(() => undefined);
    connectRealtime(api, SOCKET_URL).then((sock) => {
      if (cancelled) return sock.disconnect();
      s = sock;
      setSocket(sock);
      sock.on(SOCKET_EVENTS.adminNewOrder, (p: { orderNumber: string; totalPaise: number; orderId: string }) => {
        chime();
        toast.success(`New order ${p.orderNumber}`, { description: formatINR(p.totalPaise), action: { label: "Open", onClick: () => (window.location.href = `/orders/${p.orderId}`) }, duration: 10000 });
        setTick((t) => t + 1);
      });
      sock.on(SOCKET_EVENTS.adminOrderUpdated, () => setTick((t) => t + 1));
      sock.on(SOCKET_EVENTS.notification, (n: { title: string; body: string }) => { setUnread((u) => u + 1); toast(n.title, { description: n.body }); });
    });
    return () => { cancelled = true; s?.disconnect(); setSocket(null); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={{ socket, unread, setUnread, tick }}>{children}</Ctx.Provider>;
}

export const useAdminRealtime = () => useContext(Ctx);
