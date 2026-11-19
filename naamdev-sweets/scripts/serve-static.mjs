// Serves an app's static export (apps/<app>/out) the way Firebase Hosting does, using the same
// firebase.json settings: clean URLs, rewrites for dynamic addresses, headers (CSP) and 404.html.
// Usage: node scripts/serve-static.mjs <web|admin|delivery> <port>
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = process.argv[2] ?? "web";
const port = Number(process.argv[3] ?? 3000);
const target = app === "delivery" ? "partner" : app;
const site = JSON.parse(readFileSync(path.join(root, "firebase.json"), "utf8")).hosting.find((h) => h.target === target);
if (!site) throw new Error(`no hosting target "${target}" in firebase.json`);
const dir = path.join(root, site.public);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".webmanifest": "application/manifest+json", ".map": "application/json",
};
const glob = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
const rewrites = (site.rewrites ?? []).map((r) => ({ re: glob(r.source), destination: r.destination }));
// Local testing only: extra CSP sources (the local API and Firebase emulators), e.g. CSP_EXTRA="http://localhost:4000".
const extra = process.env.CSP_EXTRA ?? "";
const withExtra = (h) =>
  extra && h.key === "Content-Security-Policy"
    ? { ...h, value: h.value.replace(/(connect-src|img-src) ([^;]*)/g, (_m, d, v) => `${d} ${v} ${extra}`) }
    : h;
const headerRules = (site.headers ?? []).map((h) => ({ re: glob(h.source), headers: h.headers.map(withExtra) }));

const file = (p) => {
  const f = path.join(dir, p);
  return f.startsWith(dir) && existsSync(f) && statSync(f).isFile() ? f : null;
};
function resolve(urlPath) {
  const clean = urlPath.replace(/\/+$/, "") || "/";
  return (
    file(clean) ?? file(`${clean}.html`) ?? file(path.join(clean, "index.html")) ??
    (() => {
      const r = rewrites.find((x) => x.re.test(urlPath));
      return r ? file(r.destination) : null;
    })()
  );
}

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  for (const rule of headerRules) if (rule.re.test(urlPath)) for (const h of rule.headers) res.setHeader(h.key, h.value);
  const f = resolve(urlPath);
  const status = f ? 200 : 404;
  const served = f ?? file("404.html");
  if (!served) return res.writeHead(404).end("Not found");
  res.writeHead(status, { "Content-Type": TYPES[path.extname(served)] ?? "application/octet-stream" });
  if (req.method === "HEAD") return res.end();
  createReadStream(served).pipe(res);
}).listen(port, () => console.log(`${app}: http://localhost:${port} (${path.relative(root, dir)})`));
