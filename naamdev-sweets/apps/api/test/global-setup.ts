import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Server } from "node:http";
import type { TestProject } from "vitest/node";
import { PrismaClient } from "@naamdev/db";
import { RZP_MOCK_PORT, TEST_DB_SERVER } from "./constants";
import { startRazorpayMock } from "./razorpay-mock";

let mock: Server | undefined;
let dbName = "";

const admin = () => new PrismaClient({ datasourceUrl: `${TEST_DB_SERVER}/postgres` });

/**
 * Each run gets its own freshly created database, migrated with the non-destructive
 * `prisma migrate deploy` and seeded. Only that ephemeral database is dropped afterwards.
 */
export async function setup(project: TestProject) {
  dbName = `naamdev_test_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const client = admin();
  await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await client.$disconnect();
  const url = `${TEST_DB_SERVER}/${dbName}?schema=public`;
  const dbDir = path.resolve(__dirname, "../../../packages/db");
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test", SEED_DEMO_ACCOUNTS: "true" };
  execSync("npx prisma migrate deploy", { cwd: dbDir, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd: dbDir, env, stdio: "pipe" });
  project.provide("testDatabaseUrl", url);
  mock = await startRazorpayMock(RZP_MOCK_PORT);
}

export async function teardown() {
  await new Promise<void>((r) => (mock ? mock.close(() => r()) : r()));
  if (dbName.startsWith("naamdev_test_") && process.env.KEEP_TEST_DB !== "true") {
    const client = admin();
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await client.$disconnect();
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}
