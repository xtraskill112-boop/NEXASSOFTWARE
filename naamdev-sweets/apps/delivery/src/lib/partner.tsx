"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { connectRealtime, type Me, type Socket } from "@naamdev/api-client";
import { SOCKET_EVENTS } from "@naamdev/shared";
import { SOCKET_URL, api, errorMessage } from "./api";
import type { Assignment, Earnings, Partner } from "./types";

interface Ctx {
  me: Me | null | undefined;
  setMe: (m: Me | null) => void;
  partner: Partner | null;
  earnings: Earnings | null;
  offers: Assignment[];
  active: Assignment[];
  refresh: () => Promise<void>;
  setOnline: (v: boolean) => Promise<void>;
  gps: "off" | "waiting" | "ok" | "denied";
  logout: () => Promise<void>;
}
const C = createContext<Ctx | null>(null);
const PUBLIC = ["/login", "/register"];

function buzz() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 988; g.gain.value = 0.2; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35);
  } catch { /* ignore */ }
}

export function PartnerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [offers, setOffers] = useState<Assignment[]>([]);
  const [active, setActive] = useState<Assignment[]>([]);
  const [gps, setGps] = useState<Ctx["gps"]>("off");
  const watchId = useRef<number | null>(null);
  const lastSent = useRef<{ t: number; lat: number; lng: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    api.get<{ user: Me | null }>("/auth/me").then((r) => setMe(r.user && r.user.role.key === "DELIVERY_PARTNER" ? r.user : null)).catch(() => setMe(null));
  }, []);
  useEffect(() => {
    if (me === null && !PUBLIC.some((p) => pathname.startsWith(p))) router.replace("/login");
  }, [me, pathname, router]);

  const refresh = useCallback(async () => {
    try {
      const [m, o, a] = await Promise.all([
        api.get<{ partner: Partner; earnings: Earnings }>("/delivery/me"),
        api.get<{ offers: Assignment[] }>("/delivery/offers"),
        api.get<{ assignments: Assignment[] }>("/delivery/assignments/active"),
      ]);
      setPartner(m.partner);
      setEarnings(m.earnings);
      setOffers(o.offers);
      setActive(a.assignments);
    } catch (e) {
      if ((e as { status?: number }).status !== 401) toast.error(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    void refresh();
    let cancelled = false;
    connectRealtime(api, SOCKET_URL).then((s) => {
      if (cancelled) return s.disconnect();
      socketRef.current = s;
      s.on(SOCKET_EVENTS.deliveryOffer, () => { buzz(); toast("New delivery request 🛵", { duration: 8000 }); void refresh(); });
      s.on(SOCKET_EVENTS.deliveryOfferWithdrawn, () => void refresh());
      s.on(SOCKET_EVENTS.deliveryAssignmentUpdated, () => { buzz(); void refresh(); });
      s.on(SOCKET_EVENTS.notification, (n: { title: string; body: string }) => toast(n.title, { description: n.body }));
    });
    const poll = setInterval(() => void refresh(), 30000);
    return () => { cancelled = true; clearInterval(poll); socketRef.current?.disconnect(); };
  }, [me?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stream GPS while online. Positions are throttled (≥10s or ≥30m) to save battery and data.
  // Inside the NAAMDEV Partner Android app a native foreground service does this instead, so the
  // location keeps updating while the rider navigates in Google Maps.
  useEffect(() => {
    const online = partner?.isOnline;
    const shell = nativeShell();
    if (shell) {
      if (!online) {
        shell.stopTracking();
        setGps("off");
        return;
      }
      shell.startTracking();
      const read = () => setGps(NATIVE_GPS[shell.trackingState()] ?? "waiting");
      read();
      const t = setInterval(read, 3000);
      return () => clearInterval(t);
    }
    if (!online || !("geolocation" in navigator)) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setGps("off");
      return;
    }
    setGps("waiting");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps("ok");
        const { latitude: lat, longitude: lng, heading, speed, accuracy } = pos.coords;
        const l = lastSent.current;
        const moved = l ? Math.hypot((lat - l.lat) * 111000, (lng - l.lng) * 111000 * Math.cos((lat * Math.PI) / 180)) : Infinity;
        if (l && Date.now() - l.t < 10000 && moved < 30) return;
        lastSent.current = { t: Date.now(), lat, lng };
        api.post("/delivery/location", { lat, lng, heading: heading ?? null, speed: speed ?? null, accuracy: accuracy ?? null }).catch(() => undefined);
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? "denied" : "waiting"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, [partner?.isOnline]);

  const setOnline = useCallback(async (v: boolean) => {
    try {
      await api.post("/delivery/status", { online: v });
      await refresh();
      toast.success(v ? "You're online — requests will appear here" : "You're offline");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    nativeShell()?.stopTracking();
    if (partner?.isOnline) await api.post("/delivery/status", { online: false }).catch(() => undefined);
    await api.post("/auth/logout").catch(() => undefined);
    setMe(null);
    router.replace("/login");
  }, [partner?.isOnline, router]);

  return <C.Provider value={{ me, setMe, partner, earnings, offers, active, refresh, setOnline, gps, logout }}>{children}</C.Provider>;
}

/** Bridge exposed by the NAAMDEV Partner Android app (mobile/android). Absent in normal browsers. */
interface NativeShell {
  canTrack(): boolean;
  startTracking(): void;
  stopTracking(): void;
  trackingState(): string;
}

function nativeShell(): NativeShell | null {
  if (typeof window === "undefined") return null;
  const shell = (window as unknown as { NaamdevAndroid?: Partial<NativeShell> }).NaamdevAndroid;
  return shell && typeof shell.canTrack === "function" && shell.canTrack() ? (shell as NativeShell) : null;
}

const NATIVE_GPS: Record<string, Ctx["gps"]> = { ok: "ok", waiting: "waiting", denied: "denied", off: "waiting", error: "waiting", signed_out: "waiting" };

export function usePartner() {
  const c = useContext(C);
  if (!c) throw new Error("usePartner outside provider");
  return c;
}
