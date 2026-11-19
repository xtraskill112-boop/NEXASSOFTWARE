export type ClientApp = "web" | "admin" | "delivery";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { fields?: Record<string, string>; [k: string]: unknown }) {
    super(message);
  }
  get fieldErrors(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  /** Send the request without the signed-in user's token. */
  anonymous?: boolean;
}

export interface ApiClientOptions {
  app: ClientApp;
  baseUrl?: string;
  /** Returns the Firebase ID token of the signed-in user (null when signed out). */
  getToken?: () => Promise<string | null>;
  /** Storage for the guest-cart token the API hands out (web only). */
  cartToken?: { get(): string | null; set(token: string | null): void };
}

export const CART_TOKEN_HEADER = "x-cart-token";

/**
 * Thin fetch wrapper used by every frontend. In the browser it calls same-origin `/api/v1/*`
 * (Firebase Hosting / the Next.js dev server forward it to the API) and authenticates with the
 * Firebase ID token as a bearer token — no cookies, so no CSRF surface.
 */
export function createApiClient(opts: ApiClientOptions) {
  const base = (opts.baseUrl ?? "").replace(/\/$/, "");

  async function request<T>(method: string, path: string, body?: unknown, o: RequestOptions = {}): Promise<T> {
    const qs = o.query
      ? "?" + new URLSearchParams(Object.entries(o.query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
      : "";
    const headers: Record<string, string> = { "x-nds-app": opts.app, accept: "application/json", ...(o.headers ?? {}) };
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) headers["content-type"] = "application/json";
    if (!o.anonymous && opts.getToken) {
      const token = await opts.getToken().catch(() => null);
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const cart = opts.cartToken?.get();
    if (cart) headers[CART_TOKEN_HEADER] = cart;

    let res: Response;
    try {
      res = await fetch(`${base}/api/v1${path}${qs === "?" ? "" : qs}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
        credentials: "omit",
        signal: o.signal,
        cache: o.cache,
        ...(o.next ? { next: o.next } : {}),
      } as RequestInit);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw new ApiError(0, "NETWORK", "You appear to be offline. Please check your connection.");
    }
    // The API issues a guest-cart token on first add, and clears it once merged into an account.
    const issued = res.headers.get(CART_TOKEN_HEADER);
    if (issued !== null && opts.cartToken) opts.cartToken.set(issued || null);
    if (res.status === 204) return undefined as T;
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error;
      throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? `Request failed (${res.status})`, e?.details as never);
    }
    return data as T;
  }

  /** Downloads a protected file (e.g. a KYC document or CSV export) with the bearer token. */
  async function download(path: string, o: RequestOptions = {}): Promise<Blob> {
    const headers: Record<string, string> = { "x-nds-app": opts.app };
    const token = opts.getToken ? await opts.getToken().catch(() => null) : null;
    if (token) headers.authorization = `Bearer ${token}`;
    const qs = o.query ? "?" + new URLSearchParams(Object.entries(o.query).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString() : "";
    const res = await fetch(`${base}/api/v1${path}${qs === "?" ? "" : qs}`, { headers, credentials: "omit" });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      throw new ApiError(res.status, e.error?.code ?? "HTTP_ERROR", e.error?.message ?? `Download failed (${res.status})`);
    }
    return res.blob();
  }

  return {
    request,
    download,
    get: <T>(path: string, o?: RequestOptions) => request<T>("GET", path, undefined, o),
    post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("POST", path, body ?? {}, o),
    put: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("PUT", path, body ?? {}, o),
    patch: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("PATCH", path, body ?? {}, o),
    del: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("DELETE", path, body, o),
    upload: <T>(path: string, file: File, fields: Record<string, string> = {}) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append("file", file);
      return request<T>("POST", path, fd);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Saves a downloaded blob as a file in the browser. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
