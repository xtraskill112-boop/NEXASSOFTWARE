export type ClientApp = "web" | "admin" | "delivery";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { fields?: Record<string, string>; [k: string]: unknown }) {
    super(message);
  }
  get fieldErrors(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** For server-side calls: forward the incoming cookie header. */
  cookie?: string;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
}

/**
 * Thin fetch wrapper used by every frontend. In the browser it calls same-origin `/api/v1/*`
 * (proxied by Next.js rewrites to the API), so session cookies stay first-party.
 */
export function createApiClient(opts: { app: ClientApp; baseUrl?: string }) {
  const base = (opts.baseUrl ?? "").replace(/\/$/, "");
  let csrfPromise: Promise<string> | null = null;

  async function csrf(): Promise<string> {
    const existing = readCookie("nds_csrf");
    if (existing) return existing;
    csrfPromise ??= fetch(`${base}/api/v1/auth/csrf`, { credentials: "include", headers: { "x-nds-app": opts.app } })
      .then((r) => r.json())
      .then((j: { csrfToken: string }) => j.csrfToken)
      .finally(() => setTimeout(() => (csrfPromise = null), 0));
    return csrfPromise;
  }

  async function request<T>(method: string, path: string, body?: unknown, o: RequestOptions = {}): Promise<T> {
    const qs = o.query
      ? "?" + new URLSearchParams(Object.entries(o.query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
      : "";
    const headers: Record<string, string> = { "x-nds-app": opts.app, accept: "application/json", ...(o.headers ?? {}) };
    if (o.cookie) headers.cookie = o.cookie;
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) headers["content-type"] = "application/json";
    if (method !== "GET" && typeof window !== "undefined") headers["x-csrf-token"] = await csrf();

    let res: Response;
    try {
      res = await fetch(`${base}/api/v1${path}${qs === "?" ? "" : qs}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
        credentials: "include",
        signal: o.signal,
        cache: o.cache,
        ...(o.next ? { next: o.next } : {}),
      } as RequestInit);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw new ApiError(0, "NETWORK", "You appear to be offline. Please check your connection.");
    }
    if (res.status === 204) return undefined as T;
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error;
      if (res.status === 403 && e?.code === "CSRF_FAILED" && typeof document !== "undefined") document.cookie = "nds_csrf=; Max-Age=0; path=/";
      throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? `Request failed (${res.status})`, e?.details as never);
    }
    return data as T;
  }

  return {
    request,
    get: <T>(path: string, o?: RequestOptions) => request<T>("GET", path, undefined, o),
    post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("POST", path, body ?? {}, o),
    put: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("PUT", path, body ?? {}, o),
    patch: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("PATCH", path, body ?? {}, o),
    del: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>("DELETE", path, body, o),
    upload: <T>(path: string, file: File, fields: Record<string, string> = {}) => {
      const fd = new FormData();
      fd.append("file", file);
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      return request<T>("POST", path, fd);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
