// Generates the Android launcher icons for both apps from the brand SVGs in packages/ui/assets.
// Run from the repository: node naamdev-sweets/mobile/android/scripts/generate-icons.mjs
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
// sharp is already a dependency of the API package.
const sharp = createRequire(path.join(root, "apps/api/package.json"))("sharp");

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const appIcon = await readFile(path.join(root, "packages/ui/assets/app-icon.svg"), "utf8");
const emblem = await readFile(path.join(root, "packages/ui/assets/emblem.svg"), "utf8");

/** Splits a brand SVG into its <defs> and drawing (without the title and background rect). */
function parts(svg) {
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? "";
  const body = svg
    .slice(svg.indexOf("</defs>") + "</defs>".length, svg.lastIndexOf("</svg>"))
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<rect width="512" height="512"[^>]*\/>/, "");
  return { defs, body };
}

const BACKGROUNDS = {
  customer: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6E1528"/><stop offset="1" stop-color="#2E0711"/></linearGradient>`,
  partner: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD39C"/><stop offset="1" stop-color="#F59E1B"/></linearGradient>`,
};
const ARTWORK = { customer: parts(appIcon), partner: parts(emblem) };

const svg = (inner, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}${inner}</svg>`;
const scaled = (body, s) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">${body}</g>`;

async function png(svgText, size, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svgText)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
}

for (const flavour of ["customer", "partner"]) {
  const { defs, body } = ARTWORK[flavour];
  const allDefs = defs.replace("</defs>", `${BACKGROUNDS[flavour]}</defs>`);
  const resDir = path.join(here, `../app/src/${flavour}/res`);
  // Legacy (pre-Android 8) icons: full artwork on a rounded square / circle.
  const square = svg(`<rect width="512" height="512" rx="112.64" fill="url(#bg)"/>${scaled(body, 0.92)}`, allDefs);
  const round = svg(`<circle cx="256" cy="256" r="256" fill="url(#bg)"/>${scaled(body, 0.8)}`, allDefs);
  // Adaptive icon layers (108dp canvas; the artwork stays inside the 66dp safe zone).
  const background = svg(`<rect width="512" height="512" fill="url(#bg)"/>`, allDefs);
  const foreground = svg(scaled(body, 0.68), allDefs);
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await png(square, Math.round(48 * scale), path.join(dir, "ic_launcher.png"));
    await png(round, Math.round(48 * scale), path.join(dir, "ic_launcher_round.png"));
    await png(background, Math.round(108 * scale), path.join(dir, "ic_launcher_background.png"));
    await png(foreground, Math.round(108 * scale), path.join(dir, "ic_launcher_foreground.png"));
  }
  console.log(`✓ ${flavour} icons`);
}
