"use client";
/* Lazily loads the Google Maps JS API when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured. */
type LatLng = { lat: number; lng: number };
export interface GMap { setCenter(p: LatLng): void; panTo(p: LatLng): void; fitBounds(b: GBounds, pad?: number): void }
export interface GMarker { setPosition(p: LatLng): void; getPosition(): { lat(): number; lng(): number } | null; addListener(e: string, fn: () => void): void; setMap(m: GMap | null): void }
export interface GPolyline { setPath(p: LatLng[]): void; setMap(m: GMap | null): void }
export interface GBounds { extend(p: LatLng): void }
export interface GMapsNS {
  Map: new (el: HTMLElement, opts: object) => GMap;
  Marker: new (opts: object) => GMarker;
  Polyline: new (opts: object) => GPolyline;
  LatLngBounds: new () => GBounds;
}

declare global {
  interface Window {
    google?: { maps: GMapsNS };
    __ndMapsPromise?: Promise<void>;
  }
}

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function loadGoogleMaps(): Promise<GMapsNS> {
  if (!MAPS_KEY) return Promise.reject(new Error("Google Maps is not configured"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  window.__ndMapsPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&v=weekly`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__ndMapsPromise.then(() => window.google!.maps);
}
