import { execSync } from "node:child_process";
import path from "node:path";
import type { Server } from "node:http";
import { PROJECT_ID, RZP_MOCK_PORT } from "./constants";
import { startRazorpayMock } from "./razorpay-mock";

let mock: Server | undefined;

/**
 * The suite runs against the Firebase emulators (Auth + Firestore + Storage), started by
 * `pnpm test` through `firebase emulators:exec`. Each run wipes the emulator data and seeds it fresh;
 * nothing ever touches a real Firebase project.
 */
export async function setup() {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!fs || !auth) throw new Error("Run the API tests through the Firebase emulators: pnpm --filter @naamdev/api test");
  await fetch(`http://${fs}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${auth}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  const dbDir = path.resolve(__dirname, "../../../packages/db");
  execSync("npx tsx seed/seed.ts", { cwd: dbDir, env: { ...process.env, NODE_ENV: "test", FIREBASE_PROJECT_ID: PROJECT_ID, SEED_DEMO_ACCOUNTS: "true" }, stdio: "pipe" });
  mock = await startRazorpayMock(RZP_MOCK_PORT);
}

export async function teardown() {
  await new Promise<void>((r) => (mock ? mock.close(() => r()) : r()));
}
