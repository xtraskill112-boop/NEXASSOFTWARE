// Copies the seeded catalogue artwork (apps/api/public/catalog) into an app's public/static folder,
// so Firebase Hosting serves it at /static/catalog/… next to the app (static hosting has no API proxy).
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.resolve(process.argv[2] ?? process.cwd());
const from = path.join(root, "apps/api/public/catalog");
const to = path.join(appDir, "public/static/catalog");
if (!existsSync(from)) throw new Error(`missing ${from}`);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`static assets → ${path.relative(root, to)}`);
