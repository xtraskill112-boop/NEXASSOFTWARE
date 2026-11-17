"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";

/** Fetches an admin API resource and re-fetches when the path or query changes. */
export function useResource<T>(path: string | null, query?: Record<string, string | number | boolean | undefined | null>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = path ? path + JSON.stringify(query ?? {}) : null;
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await api.get<T>(path, { query: query as never });
      if (n === seq.current) { setData(r); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(errorMessage(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
