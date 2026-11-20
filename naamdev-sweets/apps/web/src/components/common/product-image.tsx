import { Emblem, cn } from "@naamdev/ui";
import { isCatalogPhoto, photoSrcSet } from "@/lib/photos";

/** Product imagery: uploaded photos, the catalogue's real photographs (responsive sizes) or SVG artwork. */
export function ProductImage({ src, alt, className, priority, sizes = 400 }: { src: string | null; alt: string; className?: string; priority?: boolean; sizes?: number }) {
  if (!src)
    return (
      <div className={cn("grid place-items-center bg-surface-2", className)}>
        <Emblem size={56} className="opacity-60" />
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isCatalogPhoto(src) && sizes <= 320 ? src.replace(/\.webp$/, "-m.webp") : src}
      srcSet={isCatalogPhoto(src) ? photoSrcSet(src) : undefined}
      sizes={isCatalogPhoto(src) ? `${sizes}px` : undefined}
      alt={alt}
      width={sizes}
      height={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      className={cn("object-cover", className)}
      draggable={false}
    />
  );
}
