"use client";
import { BrandLoader } from "@naamdev/ui";
import { PHOTO_PREFIX, usePhotoCredits } from "@/lib/photos";

/** The photographers and licences of the catalogue photos (the licences require this credit). */
export function PhotoCreditsView() {
  const credits = usePhotoCredits();
  if (!credits) return <BrandLoader className="min-h-[50dvh]" />;
  const rows = Object.entries(credits).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-semibold text-ink">Photo credits</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Until we photograph every item in our own kitchen, some products show representative photographs shared freely on Wikimedia Commons.
        Thank you to the photographers below. Photos were resized and cropped to fit; each keeps its original licence.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">All product photos are our own.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line-soft">
          {rows.map(([name, c]) => (
            <li key={name} className="flex items-center gap-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${PHOTO_PREFIX}${name}-s.webp`} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold capitalize text-ink">{name.replace(/-/g, " ")}</p>
                <p className="text-xs text-muted">
                  <a href={c.page} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">{c.title.replace(/^File:/, "")}</a> by {c.author} ·{" "}
                  {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">{c.license}</a> : c.license}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
