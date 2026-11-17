"use client";
import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { Button } from "@naamdev/ui";
import { useSettings } from "@/lib/settings";
import { MAPS_KEY, loadGoogleMaps, type GMap, type GMarker } from "./maps";

/** Drop-a-pin location selector. Uses Google Maps when configured, otherwise device GPS. */
export function MapPinPicker({ lat, lng, onChange }: { lat?: number | null; lng?: number | null; onChange: (p: { lat: number; lng: number }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const markerRef = useRef<GMarker | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const settings = useSettings();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const center = lat != null && lng != null ? { lat, lng } : settings?.store ? { lat: settings.store.lat, lng: settings.store.lng } : { lat: 26.9124, lng: 75.7873 };

  useEffect(() => {
    if (!MAPS_KEY || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !ref.current) return;
      const map = new maps.Map(ref.current, { center, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" });
      const marker = new maps.Marker({ position: center, map, draggable: true });
      marker.addListener("dragend", () => { const p = marker.getPosition(); if (p) onChange({ lat: p.lat(), lng: p.lng() }); });
      mapRef.current = map;
      markerRef.current = marker;
    }).catch((e: Error) => setErr(e.message));
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (!navigator.geolocation) return setErr("Location is not supported on this device");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(p);
        markerRef.current?.setPosition(p);
        mapRef.current?.panTo(p);
        setBusy(false);
        setErr(null);
      },
      () => { setBusy(false); setErr("Permission denied — you can still type your address."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      {MAPS_KEY ? <div ref={ref} className="h-52 w-full overflow-hidden rounded-2xl border border-line bg-surface-2" aria-label="Drag the pin to your exact location" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="soft" size="sm" loading={busy} onClick={locate}><Crosshair className="h-4 w-4" />Use current location</Button>
        {lat != null && lng != null && <span className="inline-flex items-center gap-1 text-xs font-semibold text-pista-600"><MapPin className="h-3.5 w-3.5" />Pinned ({lat.toFixed(4)}, {lng.toFixed(4)})</span>}
      </div>
      {!MAPS_KEY && <p className="text-xs text-muted">Pinning your location helps our delivery partner find you faster.</p>}
      {err && <p className="text-xs font-medium text-maroon-600">{err}</p>}
    </div>
  );
}
