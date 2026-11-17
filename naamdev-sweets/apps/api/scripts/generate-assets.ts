/* Generates catalogue illustrations, the brand emblem and app icons. Run: pnpm assets */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CATEGORIES, COLLECTIONS, PRODUCTS } from "../../../packages/db/prisma/catalog";
import { categorySvg, collectionSvg, emblemSvg, productSvg } from "./art";

const root = path.resolve(import.meta.dirname, "../../..");
const catalogDir = path.join(root, "apps/api/public/catalog");

async function main() {
  await mkdir(catalogDir, { recursive: true });
  for (const p of PRODUCTS) {
    await writeFile(path.join(catalogDir, `${p.slug}.svg`), productSvg(p.slug, p.name, p.art));
    await writeFile(path.join(catalogDir, `${p.slug}-alt.svg`), productSvg(p.slug, p.name, p.art, true));
  }
  for (const c of CATEGORIES) {
    const first = PRODUCTS.find((p) => p.category === c.slug)!;
    await writeFile(path.join(catalogDir, `category-${c.slug}.svg`), categorySvg(c.slug, c.name, first.art, c.accent));
  }
  for (const c of COLLECTIONS) {
    const arts = c.products.map((s) => PRODUCTS.find((p) => p.slug === s)!.art);
    await writeFile(path.join(catalogDir, `collection-${c.slug}.svg`), collectionSvg(c.slug, c.name, arts, c.theme));
  }

  const brandDir = path.join(root, "packages/ui/assets");
  await mkdir(brandDir, { recursive: true });
  const emblem = emblemSvg({ size: 512 });
  const tile = emblemSvg({ size: 512, background: true });
  const maskable = emblemSvg({ size: 512, background: true, maskable: true });
  await writeFile(path.join(brandDir, "emblem.svg"), emblem);
  await writeFile(path.join(brandDir, "app-icon.svg"), tile);

  for (const app of ["web", "admin", "delivery"]) {
    const pub = path.join(root, "apps", app, "public");
    await mkdir(path.join(pub, "icons"), { recursive: true });
    await writeFile(path.join(pub, "emblem.svg"), emblem);
    await writeFile(path.join(pub, "icons", "icon.svg"), tile);
    for (const size of [192, 512]) {
      await sharp(Buffer.from(tile)).resize(size, size).png().toFile(path.join(pub, "icons", `icon-${size}.png`));
      await sharp(Buffer.from(maskable)).resize(size, size).png().toFile(path.join(pub, "icons", `maskable-${size}.png`));
    }
    await sharp(Buffer.from(tile)).resize(180, 180).png().toFile(path.join(pub, "icons", "apple-touch-icon.png"));
    await sharp(Buffer.from(tile)).resize(48, 48).png().toFile(path.join(pub, "favicon.png"));
  }
  // Social sharing card for the storefront
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#52101F"/><stop offset="1" stop-color="#8F1D34"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="1000" cy="120" r="260" fill="#F57F0E" opacity="0.18"/><g transform="translate(90 150) scale(0.62)">${emblem.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g><text x="460" y="300" font-family="Georgia,serif" font-size="96" font-weight="700" fill="#FFD39C" letter-spacing="8">NAAMDEV</text><text x="466" y="360" font-family="Arial,sans-serif" font-size="34" fill="#FBE4E6" letter-spacing="22">SWEETS</text><text x="466" y="440" font-family="Georgia,serif" font-size="34" fill="#FFF7EC" font-style="italic">Mithaas that feels like home</text></svg>`;
  await sharp(Buffer.from(og)).png().toFile(path.join(root, "apps/web/public/og-image.png"));
  console.log(`Generated ${PRODUCTS.length * 2} product, ${CATEGORIES.length} category, ${COLLECTIONS.length} collection illustrations + brand icons.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
