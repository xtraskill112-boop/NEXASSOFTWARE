import { C, db, FieldValue, getDocs, type SearchQuery } from "@naamdev/db";
import { normalizeSearchTerm } from "@naamdev/shared";
import { catalog } from "./cache";

/**
 * Typo-tolerant search over product names (EN + HI), categories, tags and ingredients, using trigram
 * similarity (the same idea as PostgreSQL's pg_trgm) so "kaju katri" or "rasgula" still match.
 */
const WORD = /[\p{L}\p{N}]+/gu;
const words = (s: string) => s.toLowerCase().match(WORD) ?? [];

function trigramsOfWord(w: string, into: Set<string>) {
  const padded = `  ${w} `;
  const chars = [...padded];
  for (let i = 0; i + 3 <= chars.length; i++) into.add(chars.slice(i, i + 3).join(""));
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (const w of words(s)) trigramsOfWord(w, set);
  return set;
}

function overlap(a: Set<string>, b: Set<string>) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/** pg_trgm `similarity`: shared trigrams / all trigrams. */
export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  const shared = overlap(A, B);
  return shared / (A.size + B.size - shared);
}

/** pg_trgm `word_similarity`: best match of the query against any run of consecutive words in the text. */
export function wordSimilarity(query: string, text: string): number {
  const Q = trigrams(query);
  const ws = words(text);
  if (!Q.size || !ws.length) return 0;
  const span = Math.max(1, words(query).length);
  let best = 0;
  for (let i = 0; i < ws.length; i++) {
    for (let len = 1; len <= span + 1 && i + len <= ws.length; len++) {
      const W = new Set<string>();
      for (const w of ws.slice(i, i + len)) trigramsOfWord(w, W);
      const shared = overlap(Q, W);
      const score = shared / (Q.size + W.size - shared);
      const cover = shared / Q.size;
      best = Math.max(best, Math.min(1, (score + cover) / 2));
    }
  }
  return best;
}

export async function searchProductIds(raw: string, limit = 200): Promise<{ id: string; score: number }[]> {
  const q = normalizeSearchTerm(raw);
  if (!q) return [];
  const snap = await catalog();
  const hits: { id: string; score: number; sold: number }[] = [];
  for (const p of snap.products) {
    const cat = snap.categoryById.get(p.categoryId);
    if (!p.isActive || !cat?.isActive) continue;
    const name = p.name.toLowerCase();
    const catName = cat.name.toLowerCase();
    const ingredients = p.ingredients.toLowerCase();
    const contains = (s: string) => s.includes(q);
    const score = Math.max(
      similarity(name, q),
      wordSimilarity(q, name),
      contains(name) ? 1 : 0,
      contains(p.nameHi ?? "") ? 0.95 : 0,
      similarity(catName, q) * 0.8,
      contains(catName) ? 0.7 : 0,
      p.tags.some((t) => t.toLowerCase().includes(q)) ? 0.6 : 0,
      contains(ingredients) ? 0.45 : 0,
      wordSimilarity(q, ingredients) * 0.5,
    );
    const matches =
      similarity(name, q) >= 0.3 ||
      wordSimilarity(q, name) > 0.45 ||
      contains(name) ||
      contains(p.nameHi ?? "") ||
      contains(catName) ||
      similarity(catName, q) > 0.35 ||
      contains(ingredients) ||
      wordSimilarity(q, ingredients) > 0.6 ||
      p.tags.some((t) => t.toLowerCase().includes(q));
    if (matches) hits.push({ id: p.id, score, sold: p.soldCount });
  }
  hits.sort((a, b) => b.score - a.score || b.sold - a.sold);
  return hits.slice(0, limit).map(({ id, score }) => ({ id, score }));
}

/** "Did you mean" suggestion when nothing matched. */
export async function didYouMean(raw: string): Promise<string | null> {
  const q = normalizeSearchTerm(raw);
  if (!q) return null;
  const snap = await catalog();
  let best: { name: string; s: number } | null = null;
  for (const p of snap.products) {
    if (!p.isActive) continue;
    const s = similarity(p.name.toLowerCase(), q);
    if (!best || s > best.s) best = { name: p.name, s };
  }
  return best && best.s > 0.15 ? best.name : null;
}

const termId = (term: string) => term.replace(/\//g, " ").slice(0, 120);

export async function logSearch(raw: string, resultCount: number) {
  const term = normalizeSearchTerm(raw);
  if (term.length < 2) return;
  await db
    .collection(C.searchQueries)
    .doc(termId(term))
    .set({ term, count: FieldValue.increment(1), resultCount, lastSearchedAt: new Date() }, { merge: true });
}

const FALLBACK_TRENDING = ["kaju katli", "gift hampers", "rasgulla", "motichoor laddu", "winter specials", "gulab jamun"];
let trendingCache: { at: number; terms: string[] } | null = null;

export async function trendingSearches(limit = 8): Promise<string[]> {
  if (!trendingCache || Date.now() - trendingCache.at > 5 * 60_000) {
    const rows = await getDocs<SearchQuery>(db.collection(C.searchQueries).orderBy("count", "desc").limit(50));
    const since = Date.now() - 30 * 86_400_000;
    trendingCache = { at: Date.now(), terms: rows.filter((r) => r.resultCount > 0 && +r.lastSearchedAt >= since).map((r) => r.term) };
  }
  const terms = trendingCache.terms.slice(0, limit);
  for (const t of FALLBACK_TRENDING) if (terms.length < limit && !terms.includes(t)) terms.push(t);
  return terms;
}
