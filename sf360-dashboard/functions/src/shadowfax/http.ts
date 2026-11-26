import * as logger from "firebase-functions/logger";
import { BASE_URLS, SHADOWFAX_API_TOKEN, type SfEnv } from "../config";

export type SfErrorKind = "auth" | "forbidden" | "throttled" | "server" | "network" | "bad_response";

/** A failure talking to Shadowfax that is not a normal business answer (those are returned, not thrown). */
export class ShadowfaxError extends Error {
  constructor(
    message: string,
    readonly kind: SfErrorKind,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ShadowfaxError";
  }
}

export interface SfResponse<T = unknown> {
  status: number;
  data: T;
}

export type RetryPolicy =
  /** Reads (tracking, serviceability, POD, rate): retry 429 and 5xx with backoff. */
  | "safe"
  /** Writes: only retry 429 ("Request Blocked Temporarily" — the request never ran). */
  | "throttle-only";

export interface SfRequest {
  env: SfEnv;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  retry: RetryPolicy;
  /** Overall time budget in ms, including retries. */
  budgetMs?: number;
  /** Injected in tests. */
  token?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const REQUEST_TIMEOUT_MS = 25_000;

function authHeader(raw: string): string {
  const token = raw.trim().replace(/^(token|bearer)\s+/i, "");
  return `Token ${token}`;
}

/**
 * Local end-to-end tests point the emulator at a fake Shadowfax server (e2e/mock-shadowfax.mjs).
 * FUNCTIONS_EMULATOR is only ever "true" inside the Firebase emulator, never in a deployed function.
 */
function baseUrl(env: SfEnv): string {
  const mock = process.env.FUNCTIONS_EMULATOR === "true" ? process.env.SF360_MOCK_SHADOWFAX_URL : undefined;
  return mock && /^http:\/\/127\.0\.0\.1:\d+$/.test(mock) ? mock : BASE_URLS[env];
}

export function buildUrl(env: SfEnv, path: string, query?: SfRequest["query"]): string {
  const url = new URL(baseUrl(env) + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Backoff schedule from the docs: start at ~1-2s, cap at 60s. Rate-limit blocks can last over a minute. */
function backoffMs(attempt: number, throttled: boolean): number {
  const base = throttled ? 3000 : 1000;
  return Math.min(60_000, base * 2 ** attempt) + Math.floor(Math.random() * 400);
}

/**
 * Calls the Shadowfax client gateway.
 * - Returns 2xx/3xx/400/404 responses as-is: Shadowfax puts business errors there
 *   (Forward even answers validation failures with HTTP 200 + message "Failure").
 * - Throws ShadowfaxError for 401/403/429/5xx/network/non-JSON answers.
 * Never logs the token or request bodies.
 */
export async function sfRequest<T = unknown>(req: SfRequest): Promise<SfResponse<T>> {
  const fetchImpl = req.fetchImpl ?? fetch;
  const sleep = req.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const token = req.token ?? SHADOWFAX_API_TOKEN.value();
  if (!token || !token.trim()) {
    throw new ShadowfaxError("Shadowfax API token is not configured.", "auth", 0);
  }
  const url = buildUrl(req.env, req.path, req.query);
  const deadline = Date.now() + (req.budgetMs ?? 60_000);
  const maxAttempts = req.retry === "safe" ? 4 : 3;

  let lastError: ShadowfaxError | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: req.method,
        headers: {
          Authorization: authHeader(token),
          Accept: "application/json",
          ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // A write may or may not have reached Shadowfax: never retry it blindly.
      lastError = new ShadowfaxError(
        `Could not reach Shadowfax (${(err as Error).name === "TimeoutError" ? "timed out" : "network error"}).`,
        "network",
        0,
      );
      if (req.retry !== "safe") throw lastError;
      if (!(await waitForRetry(attempt, false, deadline, sleep))) break;
      continue;
    }

    const text = await res.text();
    let data: unknown = undefined;
    if (text.length) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }

    if (res.status === 429) {
      lastError = new ShadowfaxError(
        "Shadowfax is rate limiting requests right now. Please try again in a minute.",
        "throttled",
        429,
        data,
      );
      if (!(await waitForRetry(attempt, true, deadline, sleep))) break;
      continue;
    }
    if (res.status >= 500) {
      lastError = new ShadowfaxError(`Shadowfax server error (${res.status}). Please try again.`, "server", res.status, data);
      if (req.retry !== "safe") throw lastError;
      if (!(await waitForRetry(attempt, false, deadline, sleep))) break;
      continue;
    }
    if (res.status === 401) {
      throw new ShadowfaxError(
        "Shadowfax rejected the API token. Check that the token matches the selected environment.",
        "auth",
        401,
        data,
      );
    }
    if (res.status === 403) {
      throw new ShadowfaxError(
        pickMessage(data) ?? "Shadowfax says this account is not allowed to do this (403).",
        "forbidden",
        403,
        data,
      );
    }
    if (data === undefined && text.length) {
      logger.warn("Shadowfax returned a non-JSON response", { path: req.path, status: res.status });
      throw new ShadowfaxError(`Unexpected response from Shadowfax (${res.status}).`, "bad_response", res.status);
    }
    return { status: res.status, data: data as T };
  }
  throw lastError ?? new ShadowfaxError("Shadowfax did not answer.", "network", 0);
}

async function waitForRetry(
  attempt: number,
  throttled: boolean,
  deadline: number,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  const wait = backoffMs(attempt, throttled);
  if (Date.now() + wait > deadline) return false;
  await sleep(wait);
  return true;
}

/** Pulls a human readable message out of any of Shadowfax's error envelopes. */
export function pickMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return typeof data === "string" ? data : undefined;
  const d = data as Record<string, unknown>;
  for (const key of ["responseMsg", "detail", "message"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Flattens Shadowfax "errors" (string, array, or nested object keyed by field) into readable lines. */
export function flattenErrors(errors: unknown, prefix = ""): string[] {
  if (errors === null || errors === undefined) return [];
  if (typeof errors === "string") return [prefix ? `${prefix}: ${errors}` : errors];
  if (typeof errors === "number" || typeof errors === "boolean") return [String(errors)];
  if (Array.isArray(errors)) return errors.flatMap((e) => flattenErrors(e, prefix));
  if (typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>).flatMap(([k, v]) =>
      flattenErrors(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}
