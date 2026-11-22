"use client";
import { useEffect, useRef } from "react";
import { Bike, Home, Store } from "lucide-react";
import type { Tracking } from "@naamdev/api-client";
import { MAPS_KEY, loadGoogleMaps, type GMap, type GMarker, type GPolyline } from "../checkout/maps";

type P = { lat: number; lng: number };

/** Live delivery map. Google Maps when configured; otherwise a to-scale schematic of real coordinates. */
export function LiveMap({ tracking }: { tracking: Tracking }) {
  return MAPS_KEY ? <GoogleLiveMap tracking={tracking} /> : <Schematic tracking={tracking} />;
}

function GoogleLiveMap({ tracking }: { tracking: Tracking }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const rider = useRef<GMarker | null>(null);
  const line = useRef<GPolyline | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !el.current) return;
      const center = tracking.partnerLocation ?? tracking.drop ?? tracking.pickup ?? { lat: 26.91, lng: 75.79 };
      const m = new maps.Map(el.current, { center, zoom: 14, disableDefaultUI: true, zoomControl: true });
      map.current = m;
      const b = new maps.LatLngBounds();
      if (tracking.pickup) { new maps.Marker({ position: tracking.pickup, map: m, label: "🏪", title: "NAAMDEV kitchen" }); b.extend(tracking.pickup); }
      if (tracking.drop) { new maps.Marker({ position: tracking.drop, map: m, label: "🏠", title: "Your address" }); b.extend(tracking.drop); }
      rider.current = new maps.Marker({ position: center, map: tracking.partnerLocation ? m : null, label: "🛵", title: "Delivery partner" });
      line.current = new maps.Polyline({ path: tracking.path, map: m, strokeColor: "#F57F0E", strokeWeight: 4, strokeOpacity: 0.8 });
      if (tracking.partnerLocation) b.extend(tracking.partnerLocation);
      m.fitBounds(b, 60);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tracking.partnerLocation && rider.current) {
      rider.current.setPosition(tracking.partnerLocation);
      if (map.current) rider.current.setMap(map.current);
    }
    line.current?.setPath(tracking.path);
  }, [tracking.partnerLocation, tracking.path]);
  return <div ref={el} className="h-64 w-full rounded-2xl bg-surface-2 sm:h-80" aria-label="Live delivery map" />;
}

function Schematic({ tracking }: { tracking: Tracking }) {
  const pts: P[] = [tracking.pickup, tracking.drop, tracking.partnerLocation, ...tracking.path].filter((x): x is P => !!x);
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const pad = 0.0015;
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad, minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
  const W = 600, H = 260;
  const sx = (W - 60) / Math.max(maxLng - minLng, 1e-6), sy = (H - 60) / Math.max(maxLat - minLat, 1e-6);
  const s = Math.min(sx, sy);
  const proj = (p: P) => ({ x: 30 + (p.lng - minLng) * s + ((W - 60) - (maxLng - minLng) * s) / 2, y: H - 30 - (p.lat - minLat) * s - ((H - 60) - (maxLat - minLat) * s) / 2 });
  const path = tracking.path.map(proj);
  const pk = tracking.pickup && proj(tracking.pickup), dr = tracking.drop && proj(tracking.drop), rd = tracking.partnerLocation && proj(tracking.partnerLocation);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line-soft bg-[radial-gradient(circle_at_1px_1px,var(--nd-line)_1px,transparent_0)] [background-size:22px_22px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full sm:h-72" role="img" aria-label="Delivery route overview">
        {pk && dr && <line x1={pk.x} y1={pk.y} x2={dr.x} y2={dr.y} stroke="var(--nd-line)" strokeWidth="3" strokeDasharray="8 8" />}
        {path.length > 1 && <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#F57F0E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {pk && <Pin x={pk.x / W} y={pk.y / H} className="bg-maroon-700 text-cream-100" label="Kitchen"><Store className="h-4 w-4" /></Pin>}
      {dr && <Pin x={dr.x / W} y={dr.y / H} className="bg-pista-600 text-white" label="You"><Home className="h-4 w-4" /></Pin>}
      {rd && <Pin x={rd.x / W} y={rd.y / H} className="bg-maroon-700 text-white" label="Rider" pulse><Bike className="h-4 w-4" /></Pin>}
      <span className="absolute bottom-2 right-3 text-[10px] text-muted">Route to scale · live GPS</span>
    </div>
  );
}

function Pin({ x, y, children, className, label, pulse }: { x: number; y: number; children: React.ReactNode; className: string; label: string; pulse?: boolean }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      {pulse && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-maroon-700" />}
      <span className={`relative grid h-9 w-9 place-items-center rounded-full shadow-lg ring-4 ring-white dark:ring-black/40 ${className}`} title={label}>{children}</span>
    </div>
  );
}
