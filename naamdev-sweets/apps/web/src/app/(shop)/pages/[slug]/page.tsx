import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Card } from "@naamdev/ui";
import { Markdown } from "@/components/common/markdown";
import { fetchPublic } from "@/lib/server-api";

type Page = { slug: string; title: string; titleHi: string | null; body: string; bodyHi: string | null; seoDescription: string | null; updatedAt: string };
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await fetchPublic<{ page: Page }>(`/public/pages/${(await params).slug}`, 300);
  return d ? { title: d.page.title, description: d.page.seoDescription ?? undefined, alternates: { canonical: `/pages/${d.page.slug}` } } : { title: "Page not found" };
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await fetchPublic<{ page: Page }>(`/public/pages/${(await params).slug}`, 300);
  if (!d) notFound();
  const hi = (await cookies()).get("__session")?.value === "hi";
  const p = d.page;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-4xl font-semibold text-ink">{(hi && p.titleHi) || p.title}</h1>
      <p className="mt-2 text-xs text-muted">Last updated {new Date(p.updatedAt).toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
      <Card className="mt-8 p-6 sm:p-10"><Markdown>{(hi && p.bodyHi) || p.body}</Markdown></Card>
    </div>
  );
}
