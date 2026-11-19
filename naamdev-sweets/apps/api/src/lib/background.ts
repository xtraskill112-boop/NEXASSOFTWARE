import type { NextFunction, Request, Response } from "express";

/**
 * Work started by a request that doesn't block its business logic: notifications and live-update
 * writes. On Cloud Run (request-based billing) the CPU is throttled once a response is sent, so the
 * response is held until this work finishes (bounded), keeping notifications prompt without paying
 * for always-on CPU.
 */
const inflight = new Set<Promise<unknown>>();

export function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p);
  p.then(
    () => inflight.delete(p),
    () => inflight.delete(p),
  );
  return p;
}

/** Waits for tracked work (including work it starts) or until the timeout. */
export async function settleBackground(timeoutMs = Number.POSITIVE_INFINITY) {
  const deadline = Date.now() + timeoutMs;
  while (inflight.size) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((r) => {
      if (Number.isFinite(left)) timer = setTimeout(() => r("timeout"), left);
    });
    const r = await Promise.race([Promise.allSettled([...inflight]), timeout]);
    if (timer) clearTimeout(timer);
    if (r === "timeout") return false;
  }
  return true;
}

export function finishBackgroundWork(timeoutMs = 5000) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const end = res.end.bind(res) as (...a: unknown[]) => Response;
    let ended = false;
    res.end = function (this: Response, ...args: unknown[]) {
      if (ended) return res;
      ended = true;
      if (!inflight.size) return end(...args);
      void settleBackground(timeoutMs).finally(() => end(...args));
      return res;
    } as Response["end"];
    next();
  };
}
