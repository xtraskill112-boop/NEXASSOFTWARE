"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Me } from "@naamdev/api-client";
import { nativeAuthHandoff, onFirebaseUser, signOutFirebase, watchLive } from "@naamdev/api-client/firebase";
import { api, errorMessage } from "./api";
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
  const uidRef = useRef<string | null | undefined>(undefined);

  // Firebase restores the rider's sign-in on launch; the API decides whether it's a partner account.
  useEffect(
    () =>
      onFirebaseUser((fb) => {
        const uid = fb?.uid ?? null;
        if (uid === uidRef.current) return;
        uidRef.current = uid;
        if (!uid) return setMe(null);
        api.get<{ user: Me | null }>("/auth/me").then((r) => setMe(r.user && r.user.role.key === "DELIVERY_PARTNER" ? r.user : null)).catch(() => setMe(null));
      }),
    [],
  );
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
    // Offers and assignment changes arrive through the rider's Firestore live document.
    let seenPartner: number | null = null;
    let seenUser: number | null = null;
    const stopPartner = watchLive("livePartners", me.id, (d) => {
      const v = Number(d?.version ?? 0);
      if (seenPartner !== null && v > seenPartner) {
        if (d?.event === "offer") { buzz(); toast("New delivery request 🛵", { duration: 8000 }); }
        else if (d?.event === "assignment") buzz();
        void refresh();
      }
      seenPartner = v;
    });
    const stopUser = watchLive("liveUsers", me.id, (d) => {
      const v = Number(d?.version ?? 0);
      const last = d?.last as { title?: string; body?: string } | undefined;
      if (seenUser !== null && v > seenUser && last?.title) toast(last.title, { description: last.body });
      seenUser = v;
    });
    const poll = setInterval(() => void refresh(), 30000);
    return () => { clearInterval(poll); stopPartner(); stopUser(); };
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
      const handoff = nativeAuthHandoff();
      if (handoff) shell.setAuth?.(handoff);
      shell.startTracking();
      let lastRestart = 0;
      const read = () => {
        const st = shell.trackingState();
        // The service stops if its credentials expired (e.g. password changed); restart with fresh ones.
        if (st === "signed_out" && Date.now() - lastRestart > 30_000) {
          lastRestart = Date.now();
          const h = nativeAuthHandoff();
          if (h && shell.setAuth?.(h)) shell.startTracking();
        }
        setGps(NATIVE_GPS[st] ?? "waiting");
      };
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
    const shell = nativeShell();
    if (shell?.signedOut) shell.signedOut();
    else shell?.stopTracking();
    if (partner?.isOnline) await api.post("/delivery/status", { online: false }).catch(() => undefined);
    await api.post("/auth/logout").catch(() => undefined);
    await signOutFirebase().catch(() => undefined);
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
  /** Newer app versions: hand over Firebase credentials for background location posting. */
  setAuth?(json: string): boolean;
  signedOut?(): void;
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
