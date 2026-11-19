"use client";
import { useParams, usePathname } from "next/navigation";

/**
 * Dynamic pages are exported once as a placeholder ("_") and Firebase Hosting serves that page for
 * every matching address (see firebase.json rewrites). The real value is read from the address bar.
 * `fromEnd` is the segment position counted from the end (0 = last segment).
 */
export function useRouteParam(name: string, fromEnd = 0): string {
  const params = useParams<Record<string, string>>();
  const pathname = usePathname();
  const value = params?.[name];
  if (value && value !== "_") return decodeURIComponent(value);
  const segments = (pathname ?? "").split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1 - fromEnd] ?? "");
}
