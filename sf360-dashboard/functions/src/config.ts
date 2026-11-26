import { defineSecret, defineString } from "firebase-functions/params";

/** Mumbai — closest Cloud Functions region to Shadowfax's Indian network. */
export const REGION = "asia-south1";

/**
 * Shadowfax API token ("Token <token>" auth). Stored only in Secret Manager:
 *   firebase functions:secrets:set SHADOWFAX_API_TOKEN
 * It must belong to the environment named by SHADOWFAX_ENV (staging and production tokens differ).
 */
export const SHADOWFAX_API_TOKEN = defineSecret("SHADOWFAX_API_TOKEN");

/** Shared key Shadowfax sends back on every webhook call (configured in the SFX 360 portal → Webhook tab). */
export const SF_WEBHOOK_KEY = defineSecret("SF_WEBHOOK_KEY");

/** "staging" (default) or "production". Comes from functions/.env, written by scripts/prepare-deploy.mjs. */
export const SHADOWFAX_ENV = defineString("SHADOWFAX_ENV", {
  default: "staging",
  description: "Which Shadowfax environment the app talks to: staging or production",
});

/** Comma separated list of e-mail addresses that may use the app. */
export const ALLOWED_EMAILS = defineString("ALLOWED_EMAILS", {
  description: "Comma separated e-mail addresses allowed to log in",
});

export type SfEnv = "staging" | "production";

export function currentEnv(): SfEnv {
  return SHADOWFAX_ENV.value().trim().toLowerCase() === "production" ? "production" : "staging";
}

/** Base URLs from the Shadowfax docs (developer.shadowfax.in → Forward Logistics → Quickstart → Environments). */
export const BASE_URLS: Record<SfEnv, string> = {
  staging: "https://dale.staging.shadowfax.in/api",
  production: "https://dale.shadowfax.in/api",
};

/** The SFX 360 partner portal, linked from the docs. Used for everything the API cannot do. */
export const PANEL_URL = "https://shadowfax360.in/";

export const COLLECTIONS = {
  shipments: "shipments",
  stats: "stats",
  bulkJobs: "bulkJobs",
  settings: "settings",
  addresses: "addresses",
  webhookEvents: "webhookEvents",
  serviceabilityCache: "serviceabilityCache",
} as const;

/** Number of counter shards per environment (see stats.ts). */
export const STAT_SHARDS = 10;
