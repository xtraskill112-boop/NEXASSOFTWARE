"use client";
import Link from "next/link";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Banner } from "@naamdev/api-client";
import { cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";
import { themeBg } from "./themes";

export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const { L } = useI18n();
  const n = banners.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  useEffect(() => {
    if (paused || n < 2) return;
    const id = setInterval(() => go(1), 5500);
    return () => clearInterval(id);
  }, [paused, n, go]);
  if (!n) return null;
  const b = banners[i]!;

  return (
    <section aria-roledescription="carousel" aria-label="Featured offers" className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 sm:pt-5" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative h-[200px] overflow-hidden rounded-xl sm:h-[300px] lg:h-[340px]">
        <AnimatePresence initial={false}>
          <motion.div
            key={b.id}
            className={cn("absolute inset-0 flex", themeBg(b.theme))}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            drag={n > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_e, info: PanInfo) => info.offset.x < -60 ? go(1) : info.offset.x > 60 && go(-1)}
          >
            <div className="relative z-10 flex w-[58%] flex-col justify-center gap-1.5 p-5 sm:w-1/2 sm:gap-3 sm:p-10 lg:p-12">
              {b.eyebrow && <span className="text-[12px] font-semibold opacity-80 sm:text-[14px]">{b.eyebrow}</span>}
              <h2 className="font-display text-[21px] font-extrabold leading-[1.15] sm:text-4xl lg:text-[44px]">{L(b, "title")}</h2>
              {b.subtitle && <p className="hidden max-w-md text-base leading-snug opacity-85 sm:line-clamp-2">{b.subtitle}</p>}
              {b.ctaLink && (
                <Link href={b.ctaLink} className="mt-1.5 inline-flex w-fit items-center gap-1.5 text-[14px] font-bold underline decoration-current/30 underline-offset-4 hover:decoration-current sm:mt-3 sm:rounded-md sm:bg-ink sm:px-5 sm:py-2.5 sm:text-cream-50 sm:no-underline dark:sm:bg-cream-50 dark:sm:text-ink">
                  {b.ctaLabel ?? "Shop now"} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            {b.imageUrl && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] sm:w-1/2">
                <ProductImage src={b.imageUrl} alt="" priority className="h-full w-full object-cover" sizes={700} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {n > 1 && (
          <div className={cn("absolute bottom-3 left-5 z-20 flex gap-1.5 sm:bottom-5 sm:left-10", ["maroon", "royal", "midnight"].includes(b.theme) ? "text-cream-100" : "text-ink")}>
            {banners.map((x, k) => (
              <button key={x.id} type="button" aria-label={`Show slide ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className={cn("h-1.5 rounded-full transition-all", k === i ? "w-5 bg-current opacity-90" : "w-1.5 bg-current opacity-30")} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
