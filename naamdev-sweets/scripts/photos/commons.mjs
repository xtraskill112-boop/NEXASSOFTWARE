// Fetches real photographs of the catalogue's sweets from Wikimedia Commons (freely licensed).
//   node scripts/photos/commons.mjs candidates <outDir>  → up to 6 candidates per product (640 px) + candidates.json
//   node scripts/photos/commons.mjs final <outDir>       → the files chosen in selection.json (1600 px) + credits.json
// Only CC0 / public domain / CC BY / CC BY-SA files are accepted; the credit line each license asks for
// is saved with every photo. Runs in GitHub Actions (the development container can't reach Commons).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, outDir] = process.argv.slice(2);
if (!["candidates", "final"].includes(mode) || !outDir) throw new Error("usage: commons.mjs candidates|final <outDir>");
const API = "https://commons.wikimedia.org/w/api.php";
const HEADERS = { "User-Agent": "NAAMDEV-catalog-photos/1.0 (GitHub Actions; product photos with attribution)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const OK_LICENSE = /^(cc0|cc[- ]by(-sa)?[- ][\d.]+|public domain|pd\b|pdm)/i;

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) u.searchParams.set(k, v);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: HEADERS });
    if (r.ok) return r.json();
    await sleep(2000 * (i + 1));
  }
  throw new Error(`Commons API failed: ${u}`);
}

function describe(p) {
  const ii = p.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {};
  const license = strip(m.LicenseShortName?.value);
  return {
    title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, width: ii.width, height: ii.height, mime: ii.mime,
    license, licenseUrl: strip(m.LicenseUrl?.value) || null, author: strip(m.Artist?.value) || "Unknown author",
    description: strip(m.ImageDescription?.value).slice(0, 200),
  };
}

const IMAGE_INFO = { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription" };

async function download(url, file) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) {
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return;
    }
    await sleep(2000 * (i + 1));
  }
  throw new Error(`download failed: ${url}`);
}

mkdirSync(outDir, { recursive: true });
if (mode === "candidates") {
  const queries = JSON.parse(readFileSync(path.join(here, "queries.json"), "utf8"));
  const all = {};
  for (const [slug, qs] of Object.entries(queries)) {
    const seen = new Set();
    const picks = [];
    for (const q of qs) {
      const data = await api({ generator: "search", gsrsearch: `filetype:bitmap ${q}`, gsrnamespace: "6", gsrlimit: "12", iiurlwidth: "640", ...IMAGE_INFO });
      const pages = (data.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      for (const p of pages) {
        const d = describe(p);
        if (!d || seen.has(d.title) || !/^image\/(jpeg|png|webp)$/.test(d.mime) || d.width < 700 || d.height < 500) continue;
        if (!OK_LICENSE.test(d.license) || /logo|map|diagram|stamp|signboard/i.test(d.title)) continue;
        seen.add(d.title);
        picks.push(d);
        if (picks.length >= 6) break;
      }
      if (picks.length >= 6) break;
      await sleep(300);
    }
    mkdirSync(path.join(outDir, slug), { recursive: true });
    for (const [i, d] of picks.entries()) {
      await download(d.thumb, path.join(outDir, slug, `${i}.jpg`));
      await sleep(150);
    }
    all[slug] = picks;
    console.log(`${slug}: ${picks.length} candidate(s)`);
  }
  writeFileSync(path.join(outDir, "candidates.json"), JSON.stringify(all, null, 2));
} else {
  const selection = JSON.parse(readFileSync(path.join(here, "selection.json"), "utf8"));
  const credits = {};
  for (const [name, title] of Object.entries(selection)) {
    const data = await api({ titles: title, iiurlwidth: "1600", ...IMAGE_INFO });
    const d = describe(data.query?.pages?.[0] ?? {});
    if (!d || !OK_LICENSE.test(d.license)) throw new Error(`${name}: ${title} is missing or not freely licensed`);
    await download(d.thumb, path.join(outDir, `${name}.jpg`));
    credits[name] = { title: d.title, page: d.page, author: d.author, license: d.license, licenseUrl: d.licenseUrl };
    console.log(`${name}: ${d.title} (${d.license}, ${d.author})`);
    await sleep(300);
  }
  writeFileSync(path.join(outDir, "credits.json"), JSON.stringify(credits, null, 2));
}
