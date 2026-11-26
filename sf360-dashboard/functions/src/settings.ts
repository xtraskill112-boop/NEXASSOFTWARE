import { COLLECTIONS } from "./config";
import type { SupplyChain } from "./shadowfax/serviceability";
import { firestore } from "./store";

export interface AppSettings {
  supplyChain: SupplyChain;
}

/** settings/app is edited by the owner from the Settings page (validated by Firestore rules). */
export async function readSettings(): Promise<AppSettings> {
  const snap = await firestore().collection(COLLECTIONS.settings).doc("app").get();
  const d = snap.data() ?? {};
  return { supplyChain: d.supplyChain === "surface" ? "surface" : "regular" };
}
