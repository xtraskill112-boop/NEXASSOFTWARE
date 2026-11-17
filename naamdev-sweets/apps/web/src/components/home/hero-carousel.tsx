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
    <section aria-roledescription="carousel" aria-label="Featured offers" className="mx-auto max-w-7xl px-4 pt-2 sm:px-6 sm:pt-4" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative h-[300px] overflow-hidden rounded-[2rem] shadow-lift sm:h-[360px] lg:h-[420px]">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={b.id}
            className={cn("absolute inset-0 flex", themeBg(b.theme))}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            drag={n > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_e, info: PanInfo) => info.offset.x < -60 ? go(1) : info.offset.x > 60 && go(-1)}
          >
            <div className="nd-pattern pointer-events-none absolute inset-0 opacity-25" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
            <div className="relative z-10 flex w-full flex-col justify-center gap-3 p-6 sm:w-3/5 sm:p-10 lg:p-14">
              {b.eyebrow && (
                <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="w-fit rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] backdrop-blur">
                  {b.eyebrow}
                </motion.span>
              )}
              <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="max-w-[16ch] font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
                {L(b, "title")}
              </motion.h2>
              {b.subtitle && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: 0.32 }} className="line-clamp-2 max-w-md text-sm sm:text-base">
                  {b.subtitle}
                </motion.p>
              )}
              {b.ctaLink && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <Link href={b.ctaLink} className="mt-2 inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-bold text-maroon-800 shadow-lg transition hover:gap-3 hover:bg-cream-100">
                    {b.ctaLabel ?? "Shop now"} <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              )}
            </div>
            {b.imageUrl && (
              <motion.div initial={{ opacity: 0, scale: 0.9, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: "spring", damping: 18 }} className="pointer-events-none absolute -bottom-10 -right-16 w-[62%] max-w-[520px] sm:-right-6 sm:bottom-auto sm:top-1/2 sm:w-[46%] sm:-translate-y-1/2">
                <div className="animate-float">
                  <ProductImage src={b.imageUrl} alt="" priority className="aspect-square w-full rounded-full shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55)] ring-8 ring-white/15" sizes={600} />
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
        {n > 1 && (
          <div className="absolute bottom-4 left-6 z-20 flex gap-1.5 sm:left-10">
            {banners.map((x, k) => (
              <button key={x.id} type="button" aria-label={`Show slide ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className="h-2 overflow-hidden rounded-full bg-white/35 transition-all" style={{ width: k === i ? 28 : 8 }}>
                {k === i && !paused && <motion.span key={i} className="block h-full bg-white" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 5.5, ease: "linear" }} />}
                {k === i && paused && <span className="block h-full w-full bg-white" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
