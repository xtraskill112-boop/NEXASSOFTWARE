"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Category } from "@naamdev/api-client";
import { SectionHeading } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";

export function CategoryGrid({ title, categories }: { title: string; categories: Category[] }) {
  const { L } = useI18n();
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <SectionHeading title={title} action={<Link href="/categories" className="text-sm font-bold text-saffron-700 hover:underline dark:text-saffron-300">See all</Link>} />
      <div className="nd-scrollbar-none -mx-4 grid auto-cols-[84px] grid-flow-col grid-rows-2 gap-x-3 gap-y-5 overflow-x-auto px-4 sm:-mx-6 sm:auto-cols-[104px] sm:px-6 lg:grid-flow-row lg:grid-cols-8 lg:grid-rows-none lg:overflow-visible">
        {categories.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
            <Link href={`/category/${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
              <span className="relative block aspect-square w-full overflow-hidden rounded-full shadow-card ring-2 ring-transparent transition duration-300 group-hover:-translate-y-1 group-hover:ring-saffron-300" style={{ background: c.accentColor ?? undefined }}>
                <ProductImage src={c.imageUrl} alt={c.name} className="h-full w-full scale-110 transition duration-500 group-hover:scale-125" sizes={220} />
              </span>
              <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-ink-soft group-hover:text-ink sm:text-[13px]">{L(c, "name")}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
