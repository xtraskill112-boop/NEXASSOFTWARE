"use client";
import { useEffect, useState } from "react";
import { ApiError, api, errorMessage } from "./api";

export interface PublicState<T> {
  data: T | null;
  error: string | null;
  notFound: boolean;
  loading: boolean;
}

/** Loads public data from the API in the browser (the shop is served as static files). */
export function usePublic<T>(path: string | null, query?: Record<string, string | number | boolean | undefined>): PublicState<T> {
  const key = path ? path + JSON.stringify(query ?? {}) : null;
  const [state, setState] = useState<PublicState<T>>({ data: null, error: null, notFound: false, loading: !!path });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, notFound: false }));
    api
      .get<T>(path, { query })
      .then((data) => !cancelled && setState({ data, error: null, notFound: false, loading: false }))
      .catch((e) => !cancelled && setState({ data: null, error: errorMessage(e), notFound: e instanceof ApiError && e.status === 404, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/** Sets the browser tab title for pages whose title comes from data. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} | NAAMDEV SWEETS`;
  }, [title]);
}
