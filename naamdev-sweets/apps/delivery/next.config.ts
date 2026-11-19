import path from "node:path";
import type { NextConfig } from "next";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const isDev = process.env.NODE_ENV !== "production";
// Local Firebase emulators (development and end-to-end tests only).
const EMULATORS = [process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST, process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST, process.env.NEXT_PUBLIC_STORAGE_EMULATOR_HOST]
  .filter(Boolean)
  .map((h) => `http://${h}`)
  .join(" ");
// Firebase Auth, Firestore live listeners and Storage downloads.
const FIREBASE = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://maps.googleapis.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.razorpay.com ${EMULATORS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${FIREBASE} ${EMULATORS} https://*.razorpay.com https://maps.googleapis.com https://*.googleapis.com https://www.gstatic.com${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  // Docker images use the standalone server; local `next start` keeps the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  transpilePackages: ["@naamdev/ui", "@naamdev/shared", "@naamdev/api-client"],
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API}/api/v1/:path*` },
      { source: "/static/:path*", destination: `${API}/static/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default config;
