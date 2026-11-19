import type { Transaction } from "firebase-admin/firestore";
import { beforeCommit, C, db, FieldValue, getDocs, type Category, type Inventory, type Product, type ProductVariant, type WithId } from "@naamdev/db";

/**
 * In-memory catalogue snapshot (products, categories, stock). A sweets shop has hundreds of SKUs at
 * most, so listing, filtering, sorting and search run in memory. Each instance re-reads Firestore only
 * when the `meta/catalog` version counters change (admin edits bump `products`, stock moves bump `stock`),
 * which keeps Firestore reads — and cost — proportional to changes, not traffic.
 */
export interface CatalogSnapshot {
  products: WithId<Product>[];
  byId: Map<string, WithId<Product>>;
  bySlug: Map<string, WithId<Product>>;
  categories: WithId<Category>[];
  categoryById: Map<string, WithId<Category>>;
  categoryBySlug: Map<string, WithId<Category>>;
  stock: Map<string, WithId<Inventory>>;
  /** variantId → its product and variant. */
  variants: Map<string, { product: WithId<Product>; variant: ProductVariant }>;
}

const META = () => db.collection("meta").doc("catalog");
// How often other instances' changes are looked for, and the safety full reload. A single instance
// (the free Render setup) sees its own changes immediately, so it can check rarely and save reads.
const CHECK_EVERY_MS = Number(process.env.CATALOG_CHECK_MS ?? 5_000);
const MAX_AGE_MS = Number(process.env.CATALOG_MAX_AGE_MS ?? 10 * 60_000);

let snapshot: CatalogSnapshot | null = null;
let versions = { products: -1, stock: -1 };
let productsLoadedAt = 0;
let stockLoadedAt = 0;
let lastCheck = 0;
let loading: Promise<CatalogSnapshot> | null = null;

async function refresh(): Promise<CatalogSnapshot> {
  const meta = (await META().get()).data() as { products?: number; stock?: number } | undefined;
  const v = { products: meta?.products ?? 0, stock: meta?.stock ?? 0 };
  let products = snapshot?.products ?? [];
  let categories = snapshot?.categories ?? [];
  let stockList = snapshot ? [...snapshot.stock.values()] : [];
  if (!snapshot || v.products !== versions.products || Date.now() - productsLoadedAt > MAX_AGE_MS) {
    [products, categories] = await Promise.all([
      getDocs<Product>(db.collection(C.products).where("deletedAt", "==", null)),
      getDocs<Category>(db.collection(C.categories)),
    ]);
    productsLoadedAt = Date.now();
  }
  const started = Date.now();
  if (!snapshot || Date.now() - stockLoadedAt > MAX_AGE_MS) {
    stockList = await getDocs<Inventory>(db.collection(C.inventory));
    stockLoadedAt = started;
  } else if (v.stock !== versions.stock) {
    // Only the stock records that changed since the last load (one read each, not the whole table).
    const changed = await getDocs<Inventory>(db.collection(C.inventory).where("updatedAt", ">", new Date(stockLoadedAt - 60_000)));
    const merged = new Map(stockList.map((x) => [x.id, x]));
    for (const x of changed) merged.set(x.id, x);
    stockList = [...merged.values()];
    stockLoadedAt = started;
  }
  versions = v;
  products.sort((a, b) => +a.createdAt - +b.createdAt);
  categories.sort((a, b) => a.sortOrder - b.sortOrder);
  snapshot = {
    products,
    byId: new Map(products.map((p) => [p.id, p])),
    bySlug: new Map(products.map((p) => [p.slug, p])),
    categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    categoryBySlug: new Map(categories.map((c) => [c.slug, c])),
    stock: new Map(stockList.map((s) => [s.id, s])),
    variants: new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { product: p, variant: v }] as const))),
  };
  return snapshot;
}

export async function catalog(): Promise<CatalogSnapshot> {
  if (snapshot && Date.now() - lastCheck < CHECK_EVERY_MS) return snapshot;
  if (!loading) {
    loading = refresh().finally(() => {
      lastCheck = Date.now();
      loading = null;
    });
  }
  return loading;
}

type Kind = "products" | "stock";
const pendingKinds = new WeakMap<Transaction, Set<Kind>>();

/**
 * Marks the catalogue as changed and invalidates this instance's cache. Inside a runTx transaction
 * all bumps are merged into one write at commit.
 */
export function bumpCatalog(kind: Kind | Kind[], tx?: Transaction) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  lastCheck = 0;
  if (!tx) {
    void META().set(Object.fromEntries(kinds.map((k) => [k, FieldValue.increment(1)])), { merge: true });
    return;
  }
  let set = pendingKinds.get(tx);
  if (!set) pendingKinds.set(tx, (set = new Set()));
  kinds.forEach((k) => set!.add(k));
  beforeCommit(tx, "catalog-bump", () => tx.set(META(), Object.fromEntries([...set!].map((k) => [k, FieldValue.increment(1)])), { merge: true }));
}

/** Forces a reload on the next read (tests, admin tools). */
export function invalidateCatalog() {
  lastCheck = 0;
  versions = { products: -1, stock: -1 };
  stockLoadedAt = 0;
  productsLoadedAt = 0;
}
