// Turns the downloaded photos (commons.mjs final) into the catalogue's square WebP images:
//   node scripts/photos/process.mjs <downloadDir>
// writes apps/api/public/catalog/photos/<name>.webp (960 px), <name>-m.webp (640), <name>-s.webp (320)
// and credits.json. Crops are centred unless scripts/photos/crops.json gives a position for that name
// ("north", "south", "east", "west", "attention", …) or a region { x, y, size } in fractions.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sharp = createRequire(path.join(root, "apps/api/package.json"))("sharp");
const src = process.argv[2];
if (!src) throw new Error("usage: process.mjs <downloadDir>");
const credits = JSON.parse(readFileSync(path.join(src, "credits.json"), "utf8"));
const cropsFile = path.join(here, "crops.json");
const crops = existsSync(cropsFile) ? JSON.parse(readFileSync(cropsFile, "utf8")) : {};
const out = path.join(root, "apps/api/public/catalog/photos");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let bytes = 0;
for (const name of Object.keys(credits).sort()) {
  const input = sharp(path.join(src, `${name}.jpg`)).rotate();
  const position = crops[name] ?? "centre";
  // Smaller originals (some could only be fetched at 500 px) are used at their own size, never blown up.
  const meta = await input.metadata();
  let base = input;
  let w = meta.width ?? 960;
  let h = meta.height ?? 960;
  if (typeof position === "object") {
    // { x, y, size }: a square region given as fractions of the width/height (tighter crops).
    const sz = Math.round(position.size * Math.min(w, h));
    base = sharp(await input.extract({ left: Math.round(position.x * w), top: Math.round(position.y * h), width: sz, height: sz }).toBuffer());
    w = h = sz;
  }
  const side = Math.min(960, w, h);
  const square = await base.resize(side, side, { fit: "cover", position: typeof position === "object" ? "centre" : position }).toBuffer();
  for (const [suffix, size, quality] of [["", side, 80], ["-m", Math.min(640, side), 76], ["-s", 320, 72]]) {
    const file = path.join(out, `${name}${suffix}.webp`);
    const info = await sharp(square).resize(size, size).webp({ quality, effort: 6 }).toFile(file);
    bytes += info.size;
  }
}
writeFileSync(path.join(out, "credits.json"), JSON.stringify(credits, null, 2) + "\n");
console.log(`${Object.keys(credits).length} photos → ${path.relative(root, out)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
