import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAppInfo } from "../auth";
import type { AppSettings, BulkJob, Kind, SavedAddress, Shipment, StatusGroup } from "../types";
import { istDayStart, normalizeSearch } from "../lib/format";

export interface ShipmentFilter {
  kind: Kind;
  groups?: StatusGroup[];
  search?: string;
  /** YYYY-MM-DD, inclusive, by booking date in India. */
  from?: string;
  to?: string;
  pickupDate?: string;
}

export interface LiveList<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

/** Builds the Firestore query for a filter (also used by CSV export). */
export function shipmentConstraints(env: string, f: ShipmentFilter, max?: number): QueryConstraint[] {
  const c: QueryConstraint[] = [where("env", "==", env), where("kind", "==", f.kind)];
  const term = f.search ? normalizeSearch(f.search) : "";
  if (term) {
    // Firestore allows one array-contains; status/date filters are applied on the client for searches.
    c.push(where("searchTokens", "array-contains", term));
  } else {
    if (f.groups?.length === 1) c.push(where("statusGroup", "==", f.groups[0]));
    else if (f.groups && f.groups.length > 1) c.push(where("statusGroup", "in", f.groups.slice(0, 10)));
    if (f.pickupDate) c.push(where("pickupDate", "==", f.pickupDate));
    if (f.from) c.push(where("createdAt", ">=", istDayStart(f.from)));
    if (f.to) c.push(where("createdAt", "<", new Date(istDayStart(f.to).getTime() + 86400_000)));
  }
  c.push(orderBy("createdAt", "desc"));
  if (max) c.push(limitTo(max));
  return c;
}

/** Client-side part of a filter (needed when a search term is used). */
export function matchesFilter(s: Shipment, f: ShipmentFilter): boolean {
  if (f.groups?.length && !f.groups.includes(s.statusGroup)) return false;
  if (f.pickupDate && s.pickupDate !== f.pickupDate) return false;
  const created = s.createdAt?.toDate?.();
  if (f.from && created && created < istDayStart(f.from)) return false;
  if (f.to && created && created >= new Date(istDayStart(f.to).getTime() + 86400_000)) return false;
  return true;
}

/** Live list of shipments for a filter. Updates instantly when a webhook or sync changes a shipment. */
export function useShipments(f: ShipmentFilter, max = 50): LiveList<Shipment> {
  const { env } = useAppInfo();
  const key = JSON.stringify(f);
  const [state, setState] = useState<LiveList<Shipment>>({ items: [], loading: true, error: null });
  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const q = query(collection(db, "shipments"), ...shipmentConstraints(env, f, max));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as Shipment).filter((s) => (f.search ? matchesFilter(s, f) : true));
        setState({ items, loading: false, error: null });
      },
      (err) => setState({ items: [], loading: false, error: err.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, key, max]);
  return state;
}

export function useShipment(awb: string | undefined): { shipment: Shipment | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ shipment: Shipment | null; loading: boolean; error: string | null }>({ shipment: null, loading: true, error: null });
  useEffect(() => {
    if (!awb) return;
    return onSnapshot(
      doc(db, "shipments", awb),
      (snap) => setState({ shipment: snap.exists() ? (snap.data() as Shipment) : null, loading: false, error: null }),
      (err) => setState({ shipment: null, loading: false, error: err.message }),
    );
  }, [awb]);
  return state;
}

export type Stats = Record<string, number>;

/** Sums the sharded counters written by Cloud Functions. */
export function useStats(): { stats: Stats; loading: boolean } {
  const { env } = useAppInfo();
  const [state, setState] = useState<{ stats: Stats; loading: boolean }>({ stats: {}, loading: true });
  useEffect(() => {
    return onSnapshot(
      collection(db, "stats", env, "shards"),
      (snap) => {
        const totals: Stats = {};
        for (const d of snap.docs) {
          for (const [k, v] of Object.entries(d.data())) {
            if (typeof v === "number") totals[k] = Math.round(((totals[k] ?? 0) + v) * 100) / 100;
          }
        }
        setState({ stats: totals, loading: false });
      },
      () => setState({ stats: {}, loading: false }),
    );
  }, [env]);
  return state;
}

export const DEFAULT_SETTINGS: AppSettings = {
  supplyChain: "regular",
  defaultOrderType: "marketplace",
  defaultReturnType: "seller",
  defaultPickupId: null,
  defaultReturnId: null,
  pickupSlots: [],
  sellerGstin: null,
};

export function useSettings(): { settings: AppSettings; loading: boolean } {
  const [state, setState] = useState<{ settings: AppSettings; loading: boolean }>({ settings: DEFAULT_SETTINGS, loading: true });
  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "app"),
        (snap) => setState({ settings: { ...DEFAULT_SETTINGS, ...(snap.data() ?? {}) } as AppSettings, loading: false }),
        () => setState({ settings: DEFAULT_SETTINGS, loading: false }),
      ),
    [],
  );
  return state;
}

export function useAddresses(): LiveList<SavedAddress> {
  const [state, setState] = useState<LiveList<SavedAddress>>({ items: [], loading: true, error: null });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "addresses"), orderBy("label")),
        (snap) => setState({ items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedAddress, "id">) })), loading: false, error: null }),
        (err) => setState({ items: [], loading: false, error: err.message }),
      ),
    [],
  );
  return state;
}

export function useBulkJob(jobId: string | null): BulkJob | null {
  const [job, setJob] = useState<BulkJob | null>(null);
  useEffect(() => {
    if (!jobId) return setJob(null);
    return onSnapshot(doc(db, "bulkJobs", jobId), (snap) => setJob(snap.exists() ? (snap.data() as BulkJob) : null));
  }, [jobId]);
  return job;
}

export function useRecentWebhooks(max = 5) {
  const { env } = useAppInfo();
  const [items, setItems] = useState<{ id: string; awb: string | null; statusId: string | null; matched: boolean; receivedAt: Date | null }[]>([]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "webhookEvents"), where("env", "==", env), orderBy("receivedAt", "desc"), limitTo(max)),
        (snap) =>
          setItems(
            snap.docs.map((d) => {
              const v = d.data();
              return { id: d.id, awb: v.awb ?? null, statusId: v.statusId ?? null, matched: Boolean(v.matched), receivedAt: v.receivedAt?.toDate?.() ?? null };
            }),
          ),
        () => setItems([]),
      ),
    [env, max],
  );
  return items;
}

export function useAddressMap(addresses: SavedAddress[]) {
  return useMemo(() => new Map(addresses.map((a) => [a.id, a])), [addresses]);
}
