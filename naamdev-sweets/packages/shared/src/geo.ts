const R = 6371; // km

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough urban ETA: road distance ≈ 1.35 × crow-flies, average 18 km/h in city traffic. */
export function estimateTravelMinutes(distanceKm: number, avgKmph = 18): number {
  const roadKm = distanceKm * 1.35;
  return Math.max(3, Math.round((roadKm / avgKmph) * 60));
}

export function googleMapsDirectionsUrl(dest: { lat: number; lng: number }, origin?: { lat: number; lng: number }): string {
  const params = new URLSearchParams({ api: "1", destination: `${dest.lat},${dest.lng}`, travelmode: "two-wheeler" });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
