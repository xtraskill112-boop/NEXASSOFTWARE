"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Expand, PlayCircle, X } from "lucide-react";
import { cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { isCatalogPhoto } from "@/lib/photos";
import { ProductImage } from "../common/product-image";

/** Image gallery with hover-zoom (desktop), swipe (mobile), full-screen lightbox and optional video. */
export function Gallery({ images, name, videoUrl }: { images: { url: string; alt: string }[]; name: string; videoUrl?: string | null }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [light, setLight] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const items = images.length ? images : [{ url: "", alt: name }];
  const cur = items[i]!;
  const { t } = useI18n();
  return (
    <div className="lg:sticky lg:top-24">
      <div className="relative overflow-hidden rounded-[2rem] bg-surface-2 shadow-card ring-1 ring-line-soft">
        <div
          className="relative aspect-square cursor-zoom-in overflow-hidden"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onMouseLeave={() => setZoom(null)}
          onClick={() => setLight(true)}
        >
          {showVideo && videoUrl ? (
            <video src={videoUrl} className="h-full w-full object-cover" controls autoPlay playsInline />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={cur.url} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full"
                drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_e, info) => { if (info.offset.x < -50) setI((x) => (x + 1) % items.length); if (info.offset.x > 50) setI((x) => (x - 1 + items.length) % items.length); }}>
                <ProductImage src={cur.url || null} alt={cur.alt} priority className="h-full w-full transition-transform duration-200" sizes={900} />
              </motion.div>
            </AnimatePresence>
          )}
          {zoom && !showVideo && (
            <div className="pointer-events-none absolute inset-0 hidden lg:block" style={{ backgroundImage: `url(${cur.url})`, backgroundSize: "220%", backgroundPosition: `${zoom.x}% ${zoom.y}%` }} />
          )}
          <span className="pointer-events-none absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-ink shadow backdrop-blur dark:bg-black/50 dark:text-white"><Expand className="h-4 w-4" /></span>
        </div>
      </div>
      {/* Catalogue photos are representative (not this shop's own); uploaded photos carry no note. */}
      {!showVideo && isCatalogPhoto(cur.url) && <p className="mt-2 px-1 text-[11px] text-muted">{t("product.illustrationPhoto")}</p>}
      {(items.length > 1 || videoUrl) && (
        <div className="mt-3 flex gap-2.5">
          {items.map((im, k) => (
            <button key={im.url + k} type="button" aria-label={`View image ${k + 1}`} onClick={() => { setI(k); setShowVideo(false); }} className={cn("h-16 w-16 overflow-hidden rounded-2xl ring-2 transition sm:h-20 sm:w-20", k === i && !showVideo ? "ring-saffron-500" : "ring-transparent opacity-70 hover:opacity-100")}>
              <ProductImage src={im.url || null} alt="" className="h-full w-full" sizes={160} />
            </button>
          ))}
          {videoUrl && (
            <button type="button" onClick={() => setShowVideo(true)} className={cn("grid h-16 w-16 place-items-center rounded-2xl bg-maroon-800 text-saffron-200 ring-2 sm:h-20 sm:w-20", showVideo ? "ring-saffron-500" : "ring-transparent")} aria-label="Play product video">
              <PlayCircle className="h-7 w-7" />
            </button>
          )}
        </div>
      )}
      <AnimatePresence>
        {light && (
          <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLight(false)} role="dialog" aria-label={`${name} images`}>
            <button type="button" aria-label="Close" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white"><X /></button>
            <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-3xl" onClick={(e) => e.stopPropagation()} style={{ touchAction: "pinch-zoom" }}>
              <ProductImage src={cur.url || null} alt={cur.alt} className="h-auto w-full" sizes={1200} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
