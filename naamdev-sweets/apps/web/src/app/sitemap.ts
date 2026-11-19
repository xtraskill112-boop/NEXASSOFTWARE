import type { MetadataRoute } from "next";
import { API_URL } from "@naamdev/api-client";
import { SITE_URL } from "@/lib/api";

export const dynamic = "force-static";

type Row = { slug: string; updatedAt: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Generated when the site is built (deploy); products added later appear after the next deploy.
  const data = (await fetch(`${API_URL}/api/v1/public/sitemap-data`, { headers: { "x-nds-app": "web" } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { products: Row[]; categories: Row[]; collections: Row[]; pages: Row[] } | null;
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/offers`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/faqs`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
  ];
  if (!data) return base;
  return [
    ...base,
    ...data.categories.map((c) => ({ url: `${SITE_URL}/category/${c.slug}`, lastModified: new Date(c.updatedAt), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...data.products.map((p) => ({ url: `${SITE_URL}/product/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: "weekly" as const, priority: 0.9 })),
    ...data.collections.map((c) => ({ url: `${SITE_URL}/collections/${c.slug}`, lastModified: new Date(c.updatedAt), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...data.pages.map((p) => ({ url: `${SITE_URL}/pages/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
