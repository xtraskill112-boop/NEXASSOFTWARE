import { C, db } from "@naamdev/db";
import { DEFAULT_SETTINGS, type SettingKey, type SettingsMap } from "@naamdev/shared";

const cache = new Map<SettingKey, { value: unknown; at: number }>();
const TTL = 30_000;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as SettingsMap[K];
  const snap = await db.collection(C.settings).doc(key).get();
  const value = { ...(DEFAULT_SETTINGS[key] as object), ...((snap.data()?.value as object | undefined) ?? {}) } as SettingsMap[K];
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K], userId?: string) {
  await db.collection(C.settings).doc(key).set({ value, updatedById: userId ?? null, updatedAt: new Date() });
  cache.delete(key);
}

export function clearSettingsCache() {
  cache.clear();
}
