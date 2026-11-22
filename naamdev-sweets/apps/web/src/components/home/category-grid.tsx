"use client";
import Link from "next/link";
import type { Category } from "@naamdev/api-client";
import { SectionHeading } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";

export function CategoryGrid({ title, categories }: { title: string; categories: Category[] }) {
  const { L } = useI18n();
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <SectionHeading title={title} action={<Link href="/categories" className="text-[14px] font-semibold text-maroon-700 underline-offset-4 hover:underline dark:text-maroon-200">See all</Link>} />
      <div className="nd-scrollbar-none -mx-4 grid auto-cols-[84px] grid-flow-col grid-rows-2 gap-x-3 gap-y-5 overflow-x-auto px-4 sm:-mx-6 sm:auto-cols-[104px] sm:px-6 lg:grid-flow-row lg:grid-cols-8 lg:grid-rows-none lg:overflow-visible">
        {categories.map((c) => (
          <div key={c.id}>
            <Link href={`/category/${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
              <span className="relative block aspect-square w-full overflow-hidden rounded-xl border border-line" style={{ background: c.accentColor ?? undefined }}>
                <ProductImage src={c.imageUrl} alt={c.name} className="h-full w-full transition-transform duration-300 group-hover:scale-105" sizes={220} />
              </span>
              <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-ink-soft group-hover:text-ink sm:text-[13px]">{L(c, "name")}</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
