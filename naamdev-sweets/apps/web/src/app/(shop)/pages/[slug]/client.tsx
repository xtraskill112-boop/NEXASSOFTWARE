"use client";
import Link from "next/link";
import { BrandLoader, Card, ErrorState } from "@naamdev/ui";
import { Markdown } from "@/components/common/markdown";
import { useI18n } from "@/lib/i18n";
import { useRouteParam } from "@/lib/route-param";
import { useDocumentTitle, usePublic } from "@/lib/use-public";

type Page = { slug: string; title: string; titleHi: string | null; body: string; bodyHi: string | null; seoDescription: string | null; updatedAt: string };

export default function ContentPage() {
  const slug = useRouteParam("slug");
  const { locale } = useI18n();
  const { data, loading, notFound, error } = usePublic<{ page: Page }>(slug ? `/public/pages/${encodeURIComponent(slug)}` : null);
  const p = data?.page;
  useDocumentTitle(p?.title);
  if (loading) return <BrandLoader className="min-h-[60dvh]" />;
  if (notFound || !p) return <div className="mx-auto max-w-xl px-4 py-20"><ErrorState title="Page not found" description={notFound ? "It may have been moved or removed." : error ?? "Please try again."} action={<Link href="/" className="font-semibold text-maroon-700">Back to the shop</Link>} /></div>;
  const hi = locale === "hi";
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-4xl font-semibold text-ink">{(hi && p.titleHi) || p.title}</h1>
      <p className="mt-2 text-xs text-muted">Last updated {new Date(p.updatedAt).toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
      <Card className="mt-8 p-6 sm:p-10"><Markdown>{(hi && p.bodyHi) || p.body}</Markdown></Card>
    </div>
  );
}
