import { prisma } from "@naamdev/db";
import { DEFAULT_SETTINGS, type SettingKey, type SettingsMap } from "@naamdev/shared";

const cache = new Map<SettingKey, { value: unknown; at: number }>();
const TTL = 30_000;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as SettingsMap[K];
  const row = await prisma.setting.findUnique({ where: { key } });
  const value = { ...(DEFAULT_SETTINGS[key] as object), ...((row?.value as object) ?? {}) } as SettingsMap[K];
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K], userId?: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as object, updatedById: userId },
    create: { key, value: value as object, updatedById: userId },
  });
  cache.delete(key);
}

export function clearSettingsCache() {
  cache.clear();
}
