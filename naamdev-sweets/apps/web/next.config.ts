import path from "node:path";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

/**
 * Production builds are plain static files (out/) served by Firebase Hosting on the free plan; all
 * data comes from the API at NEXT_PUBLIC_API_URL. Security headers and the rewrites for dynamic
 * addresses (e.g. /product/<slug>) live in firebase.json. `next dev` runs as a normal dev server.
 */
export default function config(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    output: phase === PHASE_PRODUCTION_BUILD ? "export" : undefined,
    images: { unoptimized: true },
    outputFileTracingRoot: path.join(__dirname, "../.."),
    poweredByHeader: false,
    transpilePackages: ["@naamdev/ui", "@naamdev/shared", "@naamdev/api-client"],
    experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
  };
}
