const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const read = (key: string): string[] => safe(() => JSON.parse(localStorage.getItem(key) ?? "[]") as string[], []);
const write = (key: string, v: string[]) => safe(() => localStorage.setItem(key, JSON.stringify(v)), undefined);

export const recentlyViewed = {
  get: () => read("nd_recent_products"),
  push: (id: string) => write("nd_recent_products", [id, ...read("nd_recent_products").filter((x) => x !== id)].slice(0, 12)),
};

export const recentSearches = {
  get: () => read("nd_recent_searches"),
  push: (q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    write("nd_recent_searches", [t, ...read("nd_recent_searches").filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8));
  },
  clear: () => write("nd_recent_searches", []),
};

export interface SavedLocation { pincode: string; area: string | null; city: string | null; serviceable: boolean; etaMinutes?: number }
export const savedLocation = {
  get: (): SavedLocation | null => safe(() => JSON.parse(localStorage.getItem("nd_location") ?? "null") as SavedLocation | null, null),
  set: (l: SavedLocation) => safe(() => localStorage.setItem("nd_location", JSON.stringify(l)), undefined),
};
