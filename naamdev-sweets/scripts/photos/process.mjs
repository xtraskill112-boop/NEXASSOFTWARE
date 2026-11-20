// Turns the downloaded photos (commons.mjs final) into the catalogue's square WebP images:
//   node scripts/photos/process.mjs <downloadDir>
// writes apps/api/public/catalog/photos/<name>.webp (1200 px), <name>-m.webp (720), <name>-s.webp (360)
// and credits.json. Crops are centred unless scripts/photos/crops.json gives a position for that name
// ("north", "south", "east", "west", "attention", …).
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
  const square = await input.resize(1200, 1200, { fit: "cover", position }).toBuffer();
  for (const [suffix, size, quality] of [["", 1200, 78], ["-m", 720, 76], ["-s", 360, 72]]) {
    const file = path.join(out, `${name}${suffix}.webp`);
    const info = await sharp(square).resize(size, size).webp({ quality, effort: 6 }).toFile(file);
    bytes += info.size;
  }
}
writeFileSync(path.join(out, "credits.json"), JSON.stringify(credits, null, 2) + "\n");
console.log(`${Object.keys(credits).length} photos → ${path.relative(root, out)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
