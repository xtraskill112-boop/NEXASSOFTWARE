import { defineConfig } from "tsup";

export default defineConfig({
  // `seed` lets a production image initialise a fresh database: node dist/seed.js
  entry: { index: "src/index.ts", seed: "../../packages/db/prisma/seed.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Bundle workspace packages (they ship TypeScript source); keep real npm deps external.
  noExternal: [/^@naamdev\//],
  external: ["@prisma/client", ".prisma/client", "sharp", "@node-rs/argon2", "firebase-admin"],
});
