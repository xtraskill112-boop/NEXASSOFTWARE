/**
 * In-app automatic updates for the Firebase edition when it runs in the Android app or as a
 * downloaded index.html in a browser (the Windows app has its own updater in the desktop shell).
 *
 * - On start-up the newest verified version stored on the device is used.
 * - In the background the update channel (updates/latest.json in the StockSense GitHub
 *   repository) is checked; a newer release is downloaded, its size and SHA-256 are verified,
 *   it is stored in IndexedDB and the user is offered "Restart now".
 * - Anything unexpected (offline, damaged download, storage unavailable) leaves the running
 *   version untouched.
 */
import { BACKEND } from './api';
import { sha256Hex } from '@/standalone/sha256';

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

const CHANNEL_URLS = [
  'https://raw.githubusercontent.com/xtraskill112-boop/NEXASSOFTWARE/main/updates/latest.json',
  'https://raw.githubusercontent.com/xtraskill112-boop/NEXASSOFTWARE/claude/stocksense-inventory-system-e47qsb/updates/latest.json',
];
const DB_NAME = 'stocksense-updates';
const STORE = 'app';
const KEY = 'latest';
const MAX_BYTES = 25 * 1024 * 1024;
const FIRST_CHECK_MS = 8000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
export const UPDATE_READY_EVENT = 'stocksense:update-ready';

interface StoredRelease {
  version: string;
  sha256: string;
  html: string;
  notes?: string;
}

/** Desktop (app:// origin) updates through its shell; other builds use the server/offline data. */
export function liveUpdatesEnabled() {
  return BACKEND === 'firebase' && typeof window !== 'undefined' && window.location.protocol !== 'app:' && typeof indexedDB !== 'undefined';
}

function channelUrls(): string[] {
  try {
    const override = localStorage.getItem('stocksense.updateUrl');
    if (override) return [override];
  } catch {
    /* ignore */
  }
  return CHANNEL_URLS;
}

export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      /* fall back below */
    }
  }
  return sha256Hex(new TextDecoder().decode(bytes));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const readStored = () => idb<StoredRelease | undefined>('readonly', (s) => s.get(KEY));
const writeStored = (r: StoredRelease) => idb('readwrite', (s) => s.put(r, KEY));
const deleteStored = () => idb('readwrite', (s) => s.delete(KEY));

/**
 * Called before the app renders. If a newer verified release is stored on this device it
 * replaces the current page with it and returns true.
 */
export async function bootFromStoredUpdate(): Promise<boolean> {
  if (!liveUpdatesEnabled()) return false;
  try {
    const stored = await withTimeout(readStored(), 2000);
    if (!stored || compareVersions(stored.version, APP_VERSION) <= 0) {
      // This page is the newest version: a previous switch (if any) succeeded.
      sessionStorage.removeItem('stocksense.bootSwap');
      return false;
    }
    if ((await hashBytes(new TextEncoder().encode(stored.html))) !== stored.sha256) {
      await deleteStored().catch(() => undefined);
      return false;
    }
    // Loop guard: if we already switched to this release in this tab and it still reports an
    // older version, the release is faulty - discard it and keep the installed version.
    const marker = sessionStorage.getItem('stocksense.bootSwap');
    if (marker === stored.version) {
      sessionStorage.removeItem('stocksense.bootSwap');
      await deleteStored().catch(() => undefined);
      return false;
    }
    sessionStorage.setItem('stocksense.bootSwap', stored.version);
    document.open();
    document.write(stored.html);
    document.close();
    return true;
  } catch {
    return false;
  }
}

interface Manifest {
  version: string;
  file: string;
  size: number;
  sha256: string;
  notes?: string;
}

const validManifest = (m: Manifest) =>
  !!m &&
  /^\d+\.\d+\.\d+$/.test(m.version) &&
  /^[a-f0-9]{64}$/.test(m.sha256) &&
  /^[A-Za-z0-9._-]+\.html$/.test(m.file) &&
  Number.isInteger(m.size) &&
  m.size > 0 &&
  m.size <= MAX_BYTES;

let checking = false;

/** Downloads a newer release if one is published. Returns it, or null when up to date / unreachable. */
export async function checkForUpdate(): Promise<{ version: string; notes?: string } | null> {
  if (!liveUpdatesEnabled() || checking) return null;
  checking = true;
  try {
    const stored = await readStored().catch(() => undefined);
    const current = stored && compareVersions(stored.version, APP_VERSION) > 0 ? stored.version : APP_VERSION;
    for (const url of channelUrls()) {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) continue;
        const manifest = (await res.json()) as Manifest;
        if (!validManifest(manifest)) continue;
        if (compareVersions(manifest.version, current) <= 0) return null;
        const fileRes = await fetch(`${new URL(manifest.file, url).toString()}?v=${manifest.version}`, { cache: 'no-store' });
        if (!fileRes.ok) continue;
        const bytes = new Uint8Array(await fileRes.arrayBuffer());
        if (bytes.length !== manifest.size || (await hashBytes(bytes)) !== manifest.sha256) continue;
        await writeStored({ version: manifest.version, sha256: manifest.sha256, html: new TextDecoder().decode(bytes), notes: manifest.notes });
        return { version: manifest.version, notes: manifest.notes };
      } catch {
        /* try the next channel */
      }
    }
    return null;
  } finally {
    checking = false;
  }
}

/** Starts background checks; announces a downloaded release with a window event. */
export function startLiveUpdates() {
  if (!liveUpdatesEnabled()) return;
  const run = async () => {
    const found = await checkForUpdate().catch(() => null);
    if (found) window.dispatchEvent(new CustomEvent(UPDATE_READY_EVENT, { detail: found }));
  };
  setTimeout(run, FIRST_CHECK_MS);
  setInterval(run, CHECK_EVERY_MS);
}
