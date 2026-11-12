import type { ApiErrorBody } from './types';

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
const TOKEN_KEY = 'stocksense.token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages keyed by path (e.g. { sku: 'SKU is required' }) */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as { path?: string; message?: string }[]) {
        if (d?.path && d.message && !out[d.path]) out[d.path] = d.message;
      }
    }
    return out;
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;
export function onUnauthorized(listener: UnauthorizedListener | null) {
  unauthorizedListener = listener;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(params?: Query): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Skip the global "session expired" handling (used by the login call). */
  skipAuthRedirect?: boolean;
}

async function rawRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the StockSense server. Check your connection and try again.');
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 401 && !opts.skipAuthRedirect) unauthorizedListener?.();
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `Request failed with status ${res.status}`,
      body?.error?.details,
    );
  }
  return res;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Downloads a file (e.g. CSV export) using the authenticated session. */
export async function apiDownload(path: string, query?: Query, fallbackName = 'export.csv') {
  const res = await rawRequest(path, { query });
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
