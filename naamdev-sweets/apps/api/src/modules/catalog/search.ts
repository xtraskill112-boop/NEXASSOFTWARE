import { prisma } from "@naamdev/db";
import { normalizeSearchTerm } from "@naamdev/shared";

/**
 * Typo-tolerant search over product names (EN + HI), categories, tags and ingredients.
 * Uses pg_trgm similarity so "kaju katri" or "rasgula" still find the right products.
 */
export async function searchProductIds(raw: string, limit = 200): Promise<{ id: string; score: number }[]> {
  const q = normalizeSearchTerm(raw);
  if (!q) return [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const rows = await prisma.$queryRaw<{ id: string; score: number }[]>`
    SELECT p."id",
      GREATEST(
        similarity(lower(p."name"), ${q}),
        word_similarity(${q}, lower(p."name")),
        CASE WHEN lower(p."name") LIKE ${like} THEN 1.0 ELSE 0 END,
        CASE WHEN coalesce(p."nameHi", '') LIKE ${like} THEN 0.95 ELSE 0 END,
        similarity(lower(c."name"), ${q}) * 0.8,
        CASE WHEN lower(c."name") LIKE ${like} THEN 0.7 ELSE 0 END,
        CASE WHEN EXISTS (SELECT 1 FROM unnest(p."tags") t WHERE lower(t) LIKE ${like}) THEN 0.6 ELSE 0 END,
        CASE WHEN lower(p."ingredients") LIKE ${like} THEN 0.45 ELSE 0 END,
        word_similarity(${q}, lower(p."ingredients")) * 0.5
      )::float AS score
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE p."isActive" = true AND p."deletedAt" IS NULL AND c."isActive" = true
      AND (
        lower(p."name") % ${q}
        OR word_similarity(${q}, lower(p."name")) > 0.35
        OR lower(p."name") LIKE ${like}
        OR coalesce(p."nameHi", '') LIKE ${like}
        OR lower(c."name") LIKE ${like}
        OR similarity(lower(c."name"), ${q}) > 0.35
        OR lower(p."ingredients") LIKE ${like}
        OR word_similarity(${q}, lower(p."ingredients")) > 0.55
        OR EXISTS (SELECT 1 FROM unnest(p."tags") t WHERE lower(t) LIKE ${like})
      )
    ORDER BY score DESC, p."soldCount" DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, score: Number(r.score) }));
}

/** "Did you mean" suggestion when nothing matched. */
export async function didYouMean(raw: string): Promise<string | null> {
  const q = normalizeSearchTerm(raw);
  if (!q) return null;
  const rows = await prisma.$queryRaw<{ name: string; s: number }[]>`
    SELECT p."name", similarity(lower(p."name"), ${q})::float AS s FROM "Product" p
    WHERE p."isActive" = true AND p."deletedAt" IS NULL
    ORDER BY s DESC LIMIT 1`;
  return rows[0] && rows[0].s > 0.15 ? rows[0].name : null;
}

export async function logSearch(raw: string, resultCount: number) {
  const term = normalizeSearchTerm(raw);
  if (term.length < 2) return;
  await prisma.searchQuery.upsert({
    where: { term },
    update: { count: { increment: 1 }, resultCount, lastSearchedAt: new Date() },
    create: { term, resultCount },
  });
}

const FALLBACK_TRENDING = ["kaju katli", "gift hampers", "rasgulla", "motichoor laddu", "winter specials", "gulab jamun"];

export async function trendingSearches(limit = 8): Promise<string[]> {
  const rows = await prisma.searchQuery.findMany({
    where: { lastSearchedAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, resultCount: { gt: 0 } },
    orderBy: { count: "desc" },
    take: limit,
  });
  const terms = rows.map((r) => r.term);
  for (const t of FALLBACK_TRENDING) if (terms.length < limit && !terms.includes(t)) terms.push(t);
  return terms;
}
