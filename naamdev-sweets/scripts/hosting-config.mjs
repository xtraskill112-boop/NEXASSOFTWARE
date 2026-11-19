// Writes the "hosting" section of firebase.json from the apps' routes.
// Every dynamic page (e.g. app/(shop)/product/[slug]) is exported once as a placeholder
// (/product/_.html); these rewrites make Firebase Hosting serve it for /product/<anything>.
// Run after adding or removing a dynamic route: node scripts/hosting-config.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITES = [
  { target: "web", app: "web", camera: "()" },
  { target: "admin", app: "admin", camera: "()" },
  { target: "partner", app: "delivery", camera: "(self)" },
];

function pages(dir, rel = []) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pages(full, [...rel, name]));
    else if (name === "page.tsx") out.push(rel);
  }
  return out;
}

function rewritesFor(app) {
  const routes = pages(path.join(root, "apps", app, "src/app"))
    .map((segs) => segs.filter((s) => !/^\(.*\)$/.test(s))) // drop route groups like (shop)
    .filter((segs) => segs.some((s) => /^\[.+\]$/.test(s)));
  // Longer routes first so /orders/*/placed wins over /orders/*.
  routes.sort((a, b) => b.length - a.length);
  const out = [];
  for (const segs of routes) {
    const source = "/" + segs.map((s) => (/^\[.+\]$/.test(s) ? "*" : s)).join("/");
    const dest = "/" + segs.map((s) => (/^\[.+\]$/.test(s) ? "_" : s)).join("/");
    // RSC payloads (client-side navigation) and the HTML page itself.
    out.push({ source: `${source}.txt`, destination: `${dest}.txt` }, { source, destination: `${dest}.html` });
  }
  return out;
}

const FIREBASE = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com";
const API = "https://*.onrender.com"; // the API's server (Render free web service)
const csp = () =>
  [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://maps.googleapis.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${API} https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.razorpay.com`,
    "font-src 'self' data:",
    `connect-src 'self' ${API} ${FIREBASE} https://*.razorpay.com https://maps.googleapis.com https://*.googleapis.com https://www.gstatic.com`,
    "frame-src https://api.razorpay.com https://checkout.razorpay.com https://naamdevseets.firebaseapp.com",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

const hosting = SITES.map((s) => ({
  target: s.target,
  public: `apps/${s.app}/out`,
  cleanUrls: true,
  trailingSlash: false,
  rewrites: rewritesFor(s.app),
  headers: [
    {
      source: "**",
      headers: [
        { key: "Content-Security-Policy", value: csp() },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: `camera=${s.camera}, microphone=(), geolocation=(self), payment=(self)` },
        ...(s.target === "web" ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
      ],
    },
    { source: "/_next/static/**", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    { source: "/static/**", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
  ],
}));

const file = path.join(root, "firebase.json");
const config = JSON.parse(readFileSync(file, "utf8"));
config.hosting = hosting;
writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
for (const h of hosting) console.log(`${h.target}: ${h.rewrites.length / 2} dynamic route(s)`);
