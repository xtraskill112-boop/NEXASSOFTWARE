"use client";
import { useEffect, useState } from "react";

/**
 * Real catalogue photographs (freely licensed, from Wikimedia Commons) live under this path in three
 * widths: <name>-s.webp (320 px), <name>-m.webp (640 px) and <name>.webp (960 px). Their credits —
 * which the licences require us to show — are in credits.json next to them.
 */
export const PHOTO_PREFIX = "/static/catalog/photos/";

export interface PhotoCredit {
  title: string;
  page: string;
  author: string;
  license: string;
  licenseUrl: string | null;
}

export const isCatalogPhoto = (url: string | null | undefined): url is string => !!url && url.startsWith(PHOTO_PREFIX) && url.endsWith(".webp");

/** Photo name ("kaju-katli") from its URL. */
export const photoName = (url: string) => url.slice(PHOTO_PREFIX.length).replace(/\.webp$/, "");

export function photoSrcSet(url: string) {
  const base = url.replace(/\.webp$/, "");
  return `${base}-s.webp 320w, ${base}-m.webp 640w, ${url} 960w`;
}

let creditsPromise: Promise<Record<string, PhotoCredit>> | null = null;
export function loadPhotoCredits() {
  creditsPromise ??= fetch(`${PHOTO_PREFIX}credits.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return creditsPromise;
}

export function usePhotoCredits() {
  const [credits, setCredits] = useState<Record<string, PhotoCredit> | null>(null);
  useEffect(() => {
    void loadPhotoCredits().then(setCredits);
  }, []);
  return credits;
}
