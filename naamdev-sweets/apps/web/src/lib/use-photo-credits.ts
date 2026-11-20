"use client";
import { useEffect, useState } from "react";
import { loadPhotoCredits, type PhotoCredit } from "./photos";

/** Credits for the catalogue photos (null while loading). */
export function usePhotoCredits() {
  const [credits, setCredits] = useState<Record<string, PhotoCredit> | null>(null);
  useEffect(() => {
    void loadPhotoCredits().then(setCredits);
  }, []);
  return credits;
}
