/**
 * Creates a fresh, uniquely named database for an end-to-end run, applies migrations with the
 * non-destructive `migrate deploy` and seeds it. Prints the DATABASE_URL to use.
 * Usage: pnpm --filter @naamdev/api exec tsx scripts/e2e-db.ts
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@naamdev/db";

const server = process.env.TEST_DATABASE_SERVER_URL ?? "postgresql://naamdev:naamdev_dev@localhost:5432";
const name = `naamdev_e2e_${Date.now()}`;

async function main() {
  const admin = new PrismaClient({ datasourceUrl: `${server}/postgres` });
  // Remove databases left by previous E2E runs (only ones this script created).
  const old = await admin.$queryRaw<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname LIKE 'naamdev\_e2e\_%'`;
  for (const { datname } of old) if (/^naamdev_e2e_\d+$/.test(datname)) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const url = `${server}/${name}?schema=public`;
  const dbDir = path.resolve(import.meta.dirname, "../../../packages/db");
  const env = { ...process.env, DATABASE_URL: url, SEED_DEMO_ACCOUNTS: "true", NODE_ENV: "development" };
  execSync("npx prisma migrate deploy", { cwd: dbDir, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd: dbDir, env, stdio: "pipe" });
  process.stdout.write(url);
}
main().catch((e) => { console.error(e); process.exit(1); });
