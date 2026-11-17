import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
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
