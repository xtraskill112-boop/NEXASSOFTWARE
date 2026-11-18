import { defineConfig } from "tsup";

export default defineConfig({
  // `seed` lets the deployed image initialise a fresh Firestore project: node dist/seed.js
  entry: { index: "src/index.ts", seed: "../../packages/db/seed/seed.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Bundle workspace packages (they ship TypeScript source); keep real npm deps external.
  noExternal: [/^@naamdev\//],
  external: ["sharp", "firebase-admin"],
});
