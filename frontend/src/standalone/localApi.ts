import type { LocalApi } from '@/lib/localApi';
import { handleLocalRequest } from './server';
import { resetDb } from './store';

export const localApi: LocalApi = {
  async fetch(method, path, query, body, token) {
    // Round-trip the body through JSON exactly like an HTTP request would.
    const parsed = body !== undefined ? JSON.parse(JSON.stringify(body)) : undefined;
    const out = handleLocalRequest({ method, path, query, body: parsed, token });
    if (out.status === 204) return new Response(null, { status: 204 });
    if (out.text !== undefined) return new Response(out.text, { status: out.status, headers: out.headers });
    return new Response(JSON.stringify(out.body ?? null), { status: out.status, headers: { 'Content-Type': 'application/json', ...(out.headers ?? {}) } });
  },
  resetData: resetDb,
};
