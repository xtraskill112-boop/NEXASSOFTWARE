/* eslint-disable no-console */
/**
 * Idempotent Firestore seed: roles, store, delivery zones, catalogue with opening stock, coupons, banners,
 * home sections, content pages, FAQs, settings, the super admin and (outside production) demo accounts.
 * Run against the emulators (FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST) or a real project (ADC).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, SYSTEM_ROLES, sellingPrice } from "@naamdev/shared";
import {
  auth, C, SUB, FieldValue, createUserDoc, db, ensureAuthUser, newId, productDerived, syncClaims,
  type Category, type DeliveryPartner, type Inventory, type InventoryBatch, type Product, type ProductVariant, type StaffProfile,
} from "../src/index";
import { CATEGORIES, COLLECTIONS, PRODUCTS } from "./catalog";
import { CONTENT_PAGES, FAQS } from "./content";
import { KEEP, NEW_PRODUCTS, PHOTO_FALLBACK, PRICES, UNKNOWN_INGREDIENTS } from "./owner-catalogue";

const isProd = process.env.NODE_ENV === "production";
const seedDemo = process.env.SEED_DEMO_ACCOUNTS ? process.env.SEED_DEMO_ACCOUNTS === "true" : !isProd;
// Development uses the documented demo password; on a live project the demo logins must use a
// private password (the deploy passes the owner's admin password secret), never the public one.
const demoPassword = process.env.SEED_DEMO_PASSWORD || (isProd ? "" : "Naamdev@123");
const removeDemo = process.env.SEED_REMOVE_DEMO_ACCOUNTS === "true";
const DEMO_HANDLES = ["owner", "manager", "orders", "inventory", "packing", "support", "rider", "rider2", "customer"] as const;
const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProd ? "" : "Naamdev@123");
const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@naamdevsweets.local").toLowerCase();
const adminPhone = process.env.SEED_ADMIN_PHONE || (isProd ? null : "+919000000001");
// The sample sweets catalogue (products, stock, sample suppliers): always in development, opt-in in production.
const sampleCatalog = isProd ? process.env.SEED_SAMPLE_CATALOG === "true" : process.env.SEED_SAMPLE_CATALOG !== "false";
const rupees = (r: number) => Math.round(r * 100);

// Real photographs (scripts/photos): /static/catalog/photos/<name>.webp when one was chosen for that item.
const PHOTO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/api/public/catalog/photos");
const photoUrl = (name: string) => (existsSync(path.join(PHOTO_DIR, `${name}.webp`)) ? `/static/catalog/photos/${name}.webp` : null);
const photoImages = (slug: string, name: string) => {
  const urls = [photoUrl(slug), photoUrl(`${slug}-2`)].filter((u): u is string => !!u);
  return urls.map((url, i) => ({ id: newId(), url, alt: i ? `${name} — another view` : name, publicId: null, width: 960, height: 960, sortOrder: i }));
};
/** The product whose photo stands for each category. */
const CATEGORY_PHOTO: Record<string, string> = {
  "kaju-sweets": "kaju-katli", laddu: "motichoor-laddu", barfi: "kesar-pista-barfi", peda: "mathura-peda", rasgulla: "classic-rasgulla",
  "bengali-sweets": "rasmalai", "gulab-jamun": "gulab-jamun", "milk-sweets": "kalakand", "indian-sweets": "jalebi", "dry-fruits": "royal-mixed-dry-fruits",
  namkeen: "bikaneri-aloo-bhujia", snacks: "punjabi-samosa", cakes: "eggless-chocolate-truffle", "gift-hampers": "mithai-assortment-box", "special-combos": "family-feast-combo",
};
/** The owner's catalogue applies to the live shop only (development and tests keep the sample catalogue). */
const applyOwnerCatalogueHere = isProd || process.env.SEED_OWNER_CATALOGUE === "true";
const isSeedArtwork = (url: unknown) => typeof url === "string" && url.startsWith("/static/catalog/") && url.endsWith(".svg");
const day = 86_400_000;
const now = () => new Date();

async function commitInChunks(writes: ((b: FirebaseFirestore.WriteBatch) => void)[]) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => w(batch));
    await batch.commit();
  }
}

/**
 * System roles. Re-running the seed (every deploy) never undoes an owner's edits: existing roles only
 * gain permissions that are new in the code since the last seed (tracked in `seededPermissions`).
 */
async function seedRoles() {
  const existing = new Map((await db.collection(C.roles).get()).docs.map((d) => [d.id, d.data() as { permissions?: string[]; seededPermissions?: string[] }]));
  const writes = SYSTEM_ROLES.map((role) => (b: FirebaseFirestore.WriteBatch) => {
    const ref = db.collection(C.roles).doc(role.key);
    const cur = existing.get(role.key);
    const code = [...role.permissions] as string[];
    if (!cur) {
      b.set(ref, { key: role.key, name: role.name, description: role.description, isSystem: true, isStaff: role.isStaff, permissions: code, seededPermissions: code, updatedAt: now(), createdAt: now() });
      return;
    }
    const known = new Set(cur.seededPermissions ?? cur.permissions ?? []);
    const added = code.filter((p) => !known.has(p));
    const permissions = role.key === "SUPER_ADMIN" ? code : [...new Set([...(cur.permissions ?? []), ...added])];
    b.set(ref, { isSystem: true, isStaff: role.isStaff, permissions, seededPermissions: code, updatedAt: now() }, { merge: true });
  });
  await commitInChunks(writes);
  console.log(`✓ ${SYSTEM_ROLES.length} roles`);
}

async function seedStoreAndZones() {
  const storeRef = db.collection(C.stores).doc("JPR-01");
  if (!(await storeRef.get()).exists)
    await storeRef.set({
      name: "NAAMDEV SWEETS — Flagship Kitchen", code: "JPR-01", addressLine: "MI Road, near Panch Batti", city: "Jaipur", state: "Rajasthan",
      pincode: "302001", lat: 26.9157, lng: 75.8069, phone: "+911414000000", email: "kitchen@naamdevsweets.com", openingTime: "08:00",
      closingTime: "22:00", isActive: true, isDefault: true, createdAt: now(), updatedAt: now(),
    });
  const zones = [
    ["302001", "MI Road / Ajmeri Gate", 30], ["302002", "Johari Bazaar", 35], ["302003", "Ramganj", 40],
    ["302004", "Raja Park / Adarsh Nagar", 35], ["302005", "Civil Lines", 35], ["302006", "Bani Park", 30],
    ["302012", "Jhotwara", 50], ["302015", "Tonk Phatak / Gandhi Nagar", 40], ["302016", "Shastri Nagar", 40],
    ["302017", "Malviya Nagar", 45], ["302018", "Durgapura", 50], ["302019", "Shyam Nagar", 45],
    ["302020", "Mansarovar", 55], ["302021", "Vaishali Nagar", 50], ["302022", "Sanganer", 60],
    ["302023", "Vidhyadhar Nagar", 45], ["302025", "Jagatpura", 60], ["302039", "Murlipura", 50],
  ] as const;
  const existing = new Set((await db.collection(C.zones).select().get()).docs.map((d) => d.id));
  await commitInChunks(
    zones
      .filter(([pincode]) => !existing.has(pincode))
      .map(([pincode, area, eta]) => (b: FirebaseFirestore.WriteBatch) =>
        b.set(db.collection(C.zones).doc(pincode), {
          pincode, area, city: "Jaipur", etaMinutes: eta, deliveryFeePaise: null, isActive: true, createdAt: now(), updatedAt: now(),
        }),
      ),
  );
  console.log(`✓ store + ${zones.length} delivery zones`);
}

async function seedCatalog() {
  const catIds = new Map<string, string>();
  const existingCats = new Map((await db.collection(C.categories).get()).docs.map((d) => [d.data().slug as string, d.id]));
  for (const [i, c] of CATEGORIES.entries()) {
    const known = existingCats.get(c.slug);
    if (known) {
      catIds.set(c.slug, known); // never overwrite categories edited in the console
      continue;
    }
    const id = newId();
    const data: Partial<Category> = {
      slug: c.slug, name: c.name, nameHi: c.nameHi, description: c.description, accentColor: c.accent, gstRate: null, sortOrder: i, updatedAt: now(),
      imageUrl: (CATEGORY_PHOTO[c.slug] && photoUrl(CATEGORY_PHOTO[c.slug]!)) || `/static/catalog/category-${c.slug}.svg`, parentId: null, isActive: true, createdAt: now(),
    };
    await db.collection(C.categories).doc(id).set(data);
    catIds.set(c.slug, id);
  }
  if (!sampleCatalog) {
    console.log(`✓ ${CATEGORIES.length} categories (sample products skipped — add your own in the console)`);
    return;
  }

  const supplierDefs = [
    { name: "Shree Krishna Dairy Farms", contactPerson: "Mahesh Yadav", phone: "+919800000101", address: "Bassi, Jaipur" },
    { name: "Kesar Dry Fruit Traders", contactPerson: "Anil Agarwal", phone: "+919800000102", address: "Johari Bazaar, Jaipur" },
    { name: "Marwar Packaging Co.", contactPerson: "Sunita Rathore", phone: "+919800000103", address: "Sitapura Industrial Area, Jaipur" },
  ];
  const supplierIds: string[] = [];
  for (const s of supplierDefs) {
    const found = await db.collection(C.suppliers).where("name", "==", s.name).limit(1).get();
    if (!found.empty) supplierIds.push(found.docs[0]!.id);
    else {
      const ref = db.collection(C.suppliers).doc();
      await ref.set({ ...s, email: null, gstin: null, notes: null, isActive: true, createdAt: now(), updatedAt: now() });
      supplierIds.push(ref.id);
    }
  }

  const existingSlugs = new Set((await db.collection(C.products).select("slug").get()).docs.map((d) => d.data().slug as string));
  const t0 = Date.now();
  let variantCount = 0;
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const [pi, p] of PRODUCTS.entries()) {
    if (existingSlugs.has(p.slug)) continue;
    const productId = newId();
    const sku = `ND-${p.slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${String(pi + 1).padStart(3, "0")}`;
    const variants: ProductVariant[] = p.variants.map((v, vi) => ({
      id: newId(), label: v.label, weightGrams: v.weightGrams ?? null, sku: `${sku}-${vi + 1}`, barcode: null,
      mrpPaise: rupees(v.mrp), salePricePaise: v.sale ? rupees(v.sale) : null, isActive: true,
      isDefault: vi === (p.variants.length > 2 ? 1 : 0), sortOrder: vi,
    }));
    const base = {
      name: p.name, nameHi: p.nameHi ?? null, slug: p.slug, shortDescription: p.short, shortDescriptionHi: p.shortHi ?? null,
      description: p.description, categoryId: catIds.get(p.category)!, subcategoryId: null, sku, barcode: null, hsnCode: p.hsn ?? "21069099",
      ingredients: p.ingredients, allergens: [...(p.allergens ?? [])], nutrition: (p.nutrition as Record<string, unknown> | undefined) ?? null,
      manufacturingInfo: "Manufactured & packed by Naamdev Sweets Pvt. Ltd., Flagship Kitchen, MI Road, Jaipur 302001. FSSAI Lic. No. to be updated by the business.",
      shelfLifeDays: p.shelfLifeDays, storageInstructions: p.storage, foodType: p.foodType ?? "VEG",
      isFeatured: !!p.flags?.featured, isBestseller: !!p.flags?.bestseller, isNewArrival: !!p.flags?.newArrival, isActive: true,
      tags: [...(p.tags ?? [])], videoUrl: null, gstRate: null, avgRating: 0, reviewCount: 0, soldCount: 0, viewCount: 0,
      seoTitle: `${p.name} — Buy Online | NAAMDEV SWEETS`, seoDescription: p.short, deletedAt: null,
      images: photoImages(p.slug, p.name).length ? photoImages(p.slug, p.name) : [
        { id: newId(), url: `/static/catalog/${p.slug}.svg`, alt: p.name, publicId: null, width: 800, height: 800, sortOrder: 0 },
        { id: newId(), url: `/static/catalog/${p.slug}-alt.svg`, alt: `${p.name} — close-up`, publicId: null, width: 800, height: 800, sortOrder: 1 },
      ],
      variants,
      createdAt: new Date(t0 - (PRODUCTS.length - pi) * 1000),
      updatedAt: now(),
    };
    const product: Product = { ...base, ...productDerived(base) };
    writes.push((b) => b.set(db.collection(C.products).doc(productId), product));
    writes.push((b) => b.set(db.collection(C.skus).doc(sku), { productId, variantId: null }));

    for (const [vi, v] of p.variants.entries()) {
      const variant = variants[vi]!;
      writes.push((b) => b.set(db.collection(C.skus).doc(variant.sku), { productId, variantId: variant.id }));
      variantCount++;
      // Two batches per variant: an older one (FEFO consumes it first) and a fresh one.
      const shelf = p.shelfLifeDays * day;
      const olderQty = Math.max(2, Math.round(v.stock * 0.3));
      const freshQty = v.stock - olderQty;
      const olderMfg = new Date(t0 - Math.min(shelf * 0.6, 20 * day));
      const batchDefs = [
        { no: `B${String(pi + 1).padStart(3, "0")}${vi + 1}A`, qty: olderQty, mfg: olderMfg, exp: new Date(olderMfg.getTime() + shelf) },
        { no: `B${String(pi + 1).padStart(3, "0")}${vi + 1}B`, qty: freshQty, mfg: new Date(t0 - 6 * 3600_000), exp: new Date(t0 - 6 * 3600_000 + shelf) },
      ].filter((b) => b.qty > 0 && b.exp.getTime() > t0);
      let running = 0;
      for (const bd of batchDefs) {
        const batchId = newId();
        const batch: InventoryBatch = {
          variantId: variant.id, productId, batchNumber: bd.no, supplierId: supplierIds[pi % supplierIds.length]!, manufacturedAt: bd.mfg,
          expiresAt: bd.exp, quantity: bd.qty, remaining: bd.qty, costPricePaise: Math.round(sellingPrice(variant) * 0.55), status: "ACTIVE",
          expiryAlertedAt: null, createdAt: now(), updatedAt: now(),
        };
        running += bd.qty;
        const balanceAfter = running;
        writes.push((b) => b.set(db.collection(C.batches).doc(batchId), batch));
        writes.push((b) =>
          b.set(db.collection(C.stockTransactions).doc(), {
            variantId: variant.id, productId, batchId, type: "STOCK_IN", quantity: bd.qty, balanceAfter, reason: "Opening stock",
            orderId: null, createdById: null, createdAt: now(),
          }),
        );
      }
      const inv: Inventory = {
        variantId: variant.id, productId, available: running, reserved: 0, lowStockThreshold: Math.max(5, Math.round(v.stock * 0.15)),
        lastRestockedAt: now(), lowStockAlertedAt: null, updatedAt: now(),
      };
      writes.push((b) => b.set(db.collection(C.inventory).doc(variant.id), inv));
    }
    existingSlugs.add(p.slug);
  }
  await commitInChunks(writes);
  console.log(`✓ ${CATEGORIES.length} categories, ${PRODUCTS.length} products, ${variantCount} new variants`);

  const productIdBySlug = new Map((await db.collection(C.products).select("slug").get()).docs.map((d) => [d.data().slug as string, d.id]));
  for (const c of COLLECTIONS) {
    const found = await db.collection(C.collections).where("slug", "==", c.slug).limit(1).get();
    if (!found.empty) continue;
    await db.collection(C.collections).doc().set({
      slug: c.slug, name: c.name, nameHi: c.nameHi ?? null, description: c.description ?? null, theme: c.theme, isFestival: c.isFestival,
      bannerImageUrl: `/static/catalog/collection-${c.slug}.svg`, isActive: true, startsAt: null, endsAt: null,
      products: c.products.filter((s) => productIdBySlug.has(s)).map((s, i) => ({ productId: productIdBySlug.get(s)!, sortOrder: i })),
      createdAt: now(), updatedAt: now(),
    });
  }
  console.log(`✓ ${COLLECTIONS.length} collections`);
}

async function seedMarketing() {
  const cats = Object.fromEntries((await db.collection(C.categories).get()).docs.map((d) => [d.data().slug as string, d.id]));
  const year = new Date().getFullYear();
  const start = new Date(Date.now() - day);
  const end = new Date(`${year + 1}-12-31T23:59:59+05:30`);
  const coupons = [
    { code: "WELCOME100", title: "₹100 off your first order", description: "New to NAAMDEV? Enjoy ₹100 off your first order above ₹499.", type: "FIXED", value: 10000, minOrderPaise: 49900, firstOrderOnly: true },
    { code: "MITHAAS15", title: "15% off up to ₹150", description: "Sweeten every celebration — 15% off on orders above ₹699.", type: "PERCENTAGE", value: 15, maxDiscountPaise: 15000, minOrderPaise: 69900, perUserLimit: 3 },
    { code: "FREEDEL", title: "Free delivery", description: "Free delivery on orders above ₹399.", type: "FREE_DELIVERY", value: 0, minOrderPaise: 39900, perUserLimit: 5 },
    { code: "KAJU10", title: "10% off Kaju sweets", description: "10% off all kaju sweets, up to ₹200.", type: "PERCENTAGE", scope: "CATEGORY", value: 10, maxDiscountPaise: 20000, minOrderPaise: 0, categories: ["kaju-sweets"], perUserLimit: 2 },
    { code: "SHAGUN20", title: "Wedding season: 20% off hampers", description: "20% off gift hampers above ₹1,499 — up to ₹500.", type: "PERCENTAGE", scope: "CATEGORY", value: 20, maxDiscountPaise: 50000, minOrderPaise: 149900, categories: ["gift-hampers"], isFestival: true, usageLimit: 500 },
  ] as const;
  for (const c of coupons) {
    const ref = db.collection(C.coupons).doc(c.code);
    if ((await ref.get()).exists) continue;
    const x = c as typeof c & { categories?: readonly string[]; scope?: string; maxDiscountPaise?: number; perUserLimit?: number; usageLimit?: number; firstOrderOnly?: boolean; isFestival?: boolean };
    await ref.set({
      code: x.code, title: x.title, description: x.description, type: x.type, scope: x.scope ?? "ALL", value: x.value,
      maxDiscountPaise: x.maxDiscountPaise ?? null, minOrderPaise: x.minOrderPaise, startsAt: start, endsAt: end, usageLimit: x.usageLimit ?? null,
      perUserLimit: x.perUserLimit ?? 1, usedCount: 0, firstOrderOnly: x.firstOrderOnly ?? false, isFestival: x.isFestival ?? false,
      isPublic: true, isActive: true, productIds: [], categoryIds: (x.categories ?? []).map((s) => cats[s]!).filter(Boolean),
      createdAt: now(), updatedAt: now(),
    });
  }

  if ((await db.collection(C.banners).limit(1).get()).empty) {
    const banners = [
      { title: "Winter mithaas is here", titleHi: "सर्दियों की मिठास आ गई", eyebrow: "Til · Gud · Ghee", subtitle: "Til laddu, gond laddu, gajak and pinni — slow-made with pure desi ghee.", ctaLabel: "Shop winter specials", ctaLink: "/collections/winter-specials", theme: "saffron", placement: "HERO", sortOrder: 0, imageUrl: "/static/catalog/til-gud-laddu.svg" },
      { title: "Wedding season gifting", titleHi: "शादी के मौसम के उपहार", eyebrow: "Up to 20% off · SHAGUN20", subtitle: "Royal hampers and shagun boxes, personalised for your big day.", ctaLabel: "Explore hampers", ctaLink: "/collections/wedding-season", theme: "maroon", placement: "HERO", sortOrder: 1, imageUrl: "/static/catalog/royal-celebration-hamper.svg" },
      { title: "The Kaju Katli everyone talks about", titleHi: "सबकी पसंदीदा काजू कतली", eyebrow: "Bestseller · 10% off with KAJU10", subtitle: "Hand-sorted W240 cashews, silver vark, made fresh every morning.", ctaLabel: "Order now", ctaLink: "/product/kaju-katli", theme: "royal", placement: "HERO", sortOrder: 2, imageUrl: "/static/catalog/kaju-katli.svg" },
      { title: "₹100 off your first order", subtitle: "Use WELCOME100 on orders above ₹499", ctaLabel: "WELCOME100", ctaLink: "/offers", theme: "pistachio", placement: "OFFER_STRIP", sortOrder: 0 },
      { title: "Free delivery above ₹100", subtitle: "₹20 delivery on smaller orders", ctaLabel: "Learn more", ctaLink: "/pages/shipping-policy", theme: "gold", placement: "OFFER_STRIP", sortOrder: 1 },
      { title: "Fresh from the kadhai", subtitle: "Jalebi, samosa and kachori fried to order", ctaLabel: "Order hot snacks", ctaLink: "/category/snacks", theme: "rose", placement: "PROMO_GRID", sortOrder: 0, imageUrl: "/static/catalog/jalebi.svg" },
      { title: "Eggless fusion cakes", subtitle: "Rasmalai cake, gulab jamun cheesecake & more", ctaLabel: "See cakes", ctaLink: "/category/cakes", theme: "midnight", placement: "PROMO_GRID", sortOrder: 1, imageUrl: "/static/catalog/rasmalai-fusion-cake.svg" },
    ];
    await commitInChunks(
      banners.map((bn) => (b: FirebaseFirestore.WriteBatch) =>
        b.set(db.collection(C.banners).doc(), {
          titleHi: null, eyebrow: null, imageUrl: null, startsAt: null, endsAt: null, isActive: true, ...bn, createdAt: now(), updatedAt: now(),
        }),
      ),
    );
  }

  if ((await db.collection(C.homeSections).limit(1).get()).empty) {
    const col = async (slug: string) => (await db.collection(C.collections).where("slug", "==", slug).limit(1).get()).docs[0]?.id ?? null;
    const sections = [
      { type: "CATEGORY_GRID", title: "What's your craving?", titleHi: "आज क्या खाने का मन है?" },
      { type: "OFFERS", title: "Offers for you", titleHi: "आपके लिए ऑफ़र" },
      { type: "RECENTLY_VIEWED", title: "Recently viewed", titleHi: "हाल ही में देखे गए" },
      { type: "BESTSELLERS", title: "Bestselling sweets", titleHi: "बेस्टसेलर मिठाइयाँ", subtitle: "The sweets Jaipur can't stop ordering" },
      { type: "FESTIVAL_COLLECTION", title: "Winter specials", titleHi: "सर्दियों की ख़ास", subtitle: "Til, gud & ghee — made for the season", collectionId: await col("winter-specials") },
      { type: "FREQUENTLY_PURCHASED", title: "Order again", titleHi: "फिर से ऑर्डर करें" },
      { type: "NEW_ARRIVALS", title: "Fresh arrivals", titleHi: "नई मिठाइयाँ", subtitle: "New on the menu this season" },
      { type: "GIFT_HAMPERS", title: "Gift hampers", titleHi: "गिफ्ट हैम्पर", subtitle: "Handcrafted boxes for every occasion", categoryId: cats["gift-hampers"] ?? null },
      { type: "TRENDING", title: "Trending this week", titleHi: "इस हफ़्ते ट्रेंडिंग" },
      { type: "FESTIVAL_COLLECTION", title: "Wedding season gifting", titleHi: "शादी के उपहार", collectionId: await col("wedding-season") },
      { type: "RECOMMENDED", title: "Recommended for you", titleHi: "आपके लिए सुझाव" },
      { type: "FAVOURITES", title: "Customer favourites", titleHi: "ग्राहकों की पसंद", subtitle: "Highest rated by our customers" },
      { type: "POPULAR", title: "Popular near you", titleHi: "आपके पास लोकप्रिय" },
    ];
    await commitInChunks(
      sections.map((s, i) => (b: FirebaseFirestore.WriteBatch) =>
        b.set(db.collection(C.homeSections).doc(), {
          subtitle: null, collectionId: null, categoryId: null, ...s, sortOrder: i, limit: 10, isActive: true, createdAt: now(), updatedAt: now(),
        }),
      ),
    );
  }
  console.log("✓ coupons, banners, home sections");
}

async function seedContent() {
  for (const p of CONTENT_PAGES) {
    const ref = db.collection(C.pages).doc(p.slug);
    if (!(await ref.get()).exists)
      await ref.set({ bodyHi: null, ...p, titleHi: p.titleHi ?? null, seoDescription: p.seoDescription ?? null, updatedById: null, createdAt: now(), updatedAt: now() });
  }
  if ((await db.collection(C.faqs).limit(1).get()).empty)
    await commitInChunks(
      FAQS.map((f, i) => (b: FirebaseFirestore.WriteBatch) =>
        b.set(db.collection(C.faqs).doc(), { questionHi: null, answerHi: null, ...f, category: f.category ?? "General", sortOrder: i, isActive: true, createdAt: now(), updatedAt: now() }),
      ),
    );
  const store = (await db.collection(C.stores).doc("JPR-01").get()).data();
  const settings = {
    ...DEFAULT_SETTINGS,
    storeProfile: {
      ...DEFAULT_SETTINGS.storeProfile,
      phone: store?.phone ?? "",
      address: store ? `${store.addressLine}, ${store.city}, ${store.state} ${store.pincode}` : "",
    },
    social: { instagram: "https://instagram.com/", facebook: "https://facebook.com/", youtube: "https://youtube.com/" },
  };
  for (const [key, value] of Object.entries(settings)) {
    const ref = db.collection(C.settings).doc(key);
    if (!(await ref.get()).exists) await ref.set({ value, updatedById: null, updatedAt: now() });
  }
  console.log(`✓ ${CONTENT_PAGES.length} content pages, ${FAQS.length} FAQs, settings`);
}

async function upsertAccount(opts: { name: string; email: string; phone: string | null; password: string; role: string; staff?: { designation: string; code: string } }) {
  const uid = await ensureAuthUser(opts.email, opts.password, opts.name, { resetPassword: false });
  const role = (await db.collection(C.roles).doc(opts.role).get()).data()!;
  const userRef = db.collection(C.users).doc(uid);
  const staff: StaffProfile | null = opts.staff
    ? { employeeCode: opts.staff.code, designation: opts.staff.designation, storeId: "JPR-01", isActive: true, joinedAt: now(), notes: null }
    : null;
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists) {
      tx.update(userRef, { roleKey: opts.role, isStaff: !!role.isStaff, name: opts.name, staff: staff ?? existing.data()?.staff ?? null, updatedAt: now() });
      return;
    }
    await createUserDoc(tx, uid, { name: opts.name, email: opts.email, phone: opts.phone, roleKey: opts.role, isStaff: !!role.isStaff, staff, emailVerified: true });
  });
  await syncClaims(uid, opts.role, !!role.isStaff);
  return uid;
}

async function seedAccounts() {
  const admin = { name: "Super Admin", email: adminEmail, phone: adminPhone, role: "SUPER_ADMIN", staff: { designation: "Platform Administrator", code: "ND-ADMIN" } };
  if (adminPassword) {
    await upsertAccount({ ...admin, password: adminPassword });
    console.log(isProd ? "✓ super admin" : `✓ super admin ${adminEmail}`);
  } else if (isProd && process.env.SEED_ADMIN_EMAIL) {
    // No password given: the login is created with a random password nobody knows, and the owner
    // sets their own from Firebase's password-reset email (sent by the deploy workflow).
    let existed = true;
    try {
      await auth.getUserByEmail(adminEmail);
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      existed = false;
    }
    await upsertAccount({ ...admin, password: `${randomBytes(24).toString("base64url")}Aa1` });
    if (!existed && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "admin_created=true\n");
    console.log(existed ? "✓ super admin (existing login kept)" : "✓ super admin login created — the owner sets the password from the reset email");
  } else {
    console.warn("! SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping super admin creation.");
  }
  if (removeDemo) return removeDemoAccounts();
  if (!seedDemo) return;
  if (!demoPassword) {
    console.warn("! Demo logins skipped: set SEED_DEMO_PASSWORD (the deploy uses NAAMDEV_ADMIN_PASSWORD).");
    return;
  }
  const staff = [
    ["Store Owner (Demo)", "owner", "+919000000002", "STORE_OWNER", "Owner"],
    ["Store Manager (Demo)", "manager", "+919000000003", "STORE_MANAGER", "Store Manager"],
    ["Order Manager (Demo)", "orders", "+919000000004", "ORDER_MANAGER", "Order Manager"],
    ["Inventory Manager (Demo)", "inventory", "+919000000005", "INVENTORY_MANAGER", "Inventory Manager"],
    ["Packing Staff (Demo)", "packing", "+919000000006", "PACKING_STAFF", "Packing Lead"],
    ["Support Agent (Demo)", "support", "+919000000007", "SUPPORT_AGENT", "Customer Support"],
  ] as const;
  for (const [i, [name, handle, phone, role, designation]] of staff.entries())
    await upsertAccount({ name, email: `${handle}@naamdevsweets.local`, phone, password: demoPassword, role, staff: { designation, code: `ND-${101 + i}` } });

  const partner = async (uid: string, data: Partial<DeliveryPartner> & Pick<DeliveryPartner, "status" | "vehicleType">) => {
    const ref = db.collection(C.partners).doc(uid);
    if ((await ref.get()).exists) return;
    const user = (await db.collection(C.users).doc(uid).get()).data()!;
    const p: DeliveryPartner = {
      userId: uid, name: user.name, phone: user.phone, email: user.email, vehicleNumber: null, licenseNumber: null, city: "Jaipur", isOnline: false,
      currentLat: null, currentLng: null, lastLocationAt: null, rating: 5, totalDeliveries: 0, bankAccountName: null,
      bankAccountEncrypted: null, bankAccountLast4: null, bankIfsc: null, upiId: null, emergencyContact: null, approvedAt: null, approvedById: null,
      statusReason: null, createdAt: now(), updatedAt: now(), ...data,
    };
    await ref.set(p);
  };
  const rider = await upsertAccount({ name: "Demo Rider", email: "rider@naamdevsweets.local", phone: "+919000000010", password: demoPassword, role: "DELIVERY_PARTNER" });
  await partner(rider, { status: "APPROVED", vehicleType: "SCOOTER", vehicleNumber: "RJ14 AB 0000", approvedAt: now(), currentLat: 26.9124, currentLng: 75.7873 });
  const pending = await upsertAccount({ name: "Pending Rider (Demo)", email: "rider2@naamdevsweets.local", phone: "+919000000011", password: demoPassword, role: "DELIVERY_PARTNER" });
  await partner(pending, { status: "PENDING", vehicleType: "MOTORCYCLE" });

  const customer = await upsertAccount({ name: "Demo Customer", email: "customer@naamdevsweets.local", phone: "+919000000100", password: demoPassword, role: "CUSTOMER" });
  const addresses = db.collection(C.users).doc(customer).collection(SUB.addresses);
  if ((await addresses.limit(1).get()).empty)
    await addresses.doc().set({
      userId: customer, type: "HOME", label: null, fullName: "Demo Customer", phone: "+919000000100", line1: "Flat 12, Demo Residency",
      line2: "Ashok Marg, C-Scheme", landmark: "Near Statue Circle", city: "Jaipur", state: "Rajasthan", pincode: "302001",
      lat: 26.9056, lng: 75.8031, instructions: null, isDefault: true, deletedAt: null, createdAt: now(), updatedAt: now(),
    });
  console.log(`✓ demo staff (${staff.length}), 2 delivery partners, 1 demo customer${isProd ? "" : ` — password: ${demoPassword}`}`);
}

/** Removes the demo logins from a live project (orders they placed are kept). */
async function removeDemoAccounts() {
  let removed = 0;
  for (const handle of DEMO_HANDLES) {
    const email = `${handle}@naamdevsweets.local`;
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(email)).uid;
    } catch {
      continue;
    }
    await auth.deleteUser(uid);
    const userRef = db.collection(C.users).doc(uid);
    const user = (await userRef.get()).data();
    if (user) await userRef.update({ status: "DELETED", isStaff: false, ...(user.staff ? { staff: { ...user.staff, isActive: false } } : {}), updatedAt: now() });
    const partnerRef = db.collection(C.partners).doc(uid);
    if ((await partnerRef.get()).exists) await partnerRef.update({ status: "SUSPENDED", isOnline: false, statusReason: "Demo login removed", updatedAt: now() });
    removed++;
  }
  console.log(`✓ removed ${removed} demo login(s)`);
}

/**
 * One-time data changes for an existing shop, recorded in meta/migrations so each runs once. They set
 * what the owner asked for at that time; anything changed later in the console is left alone.
 */
/** A migration returns false when it can't run yet (it is then tried again on the next seed). */
const MIGRATIONS: { id: string; run: () => Promise<void | false> }[] = [
  { id: "2026-11-21-owner-catalogue", run: () => applyOwnerCatalogue() },
  { id: "2026-11-21-menu-home", run: () => menuHome() },
  { id: "2026-11-21-archive-old-products", run: () => archiveOldProducts() },
  {
    // No GST; ₹20 delivery below ₹100, free from ₹100; no minimum order.
    id: "2026-11-20-no-gst-flat-delivery",
    run: async () => {
      const ref = db.collection(C.settings).doc("checkout");
      const current = ((await ref.get()).data()?.value ?? {}) as Record<string, unknown>;
      await ref.set({ value: { ...current, defaultGstRate: 0, baseDeliveryFeePaise: 2000, freeDeliveryThresholdPaise: 10000, minOrderPaise: 0 }, updatedById: null, updatedAt: now() });
      const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
      for (const col of [C.categories, C.products]) {
        for (const d of (await db.collection(col).where("gstRate", "!=", null).get()).docs) writes.push((b) => b.update(d.ref, { gstRate: null, updatedAt: now() }));
      }
      for (const d of (await db.collection(C.zones).where("deliveryFeePaise", "!=", null).get()).docs) writes.push((b) => b.update(d.ref, { deliveryFeePaise: null, updatedAt: now() }));
      for (const d of (await db.collection(C.banners).where("title", "==", "Free delivery above ₹999").get()).docs)
        writes.push((b) => b.update(d.ref, { title: "Free delivery above ₹100", subtitle: "₹20 delivery on smaller orders", updatedAt: now() }));
      await commitInChunks(writes);
      console.log(`  ${writes.length} record(s) updated`);
    },
  },
];

/** Rails that repeat what the full menu already shows; hidden (not deleted) so the owner can bring any back. */
const MENU_DUPLICATES = new Set(["CATEGORY_GRID", "BESTSELLERS", "POPULAR", "NEW_ARRIVALS", "TRENDING", "RECOMMENDED", "FAVOURITES", "GIFT_HAMPERS"]);

/**
 * The home page leads with the whole menu — every product, grouped by category — so customers don't
 * have to dig through rails and category pages. Offers, "Order again", recently viewed and festival
 * collections follow it, in their current order.
 */
async function menuHome() {
  const rows = (await db.collection(C.homeSections).get()).docs
    .map((d) => ({ ref: d.ref, ...(d.data() as { type: string; sortOrder: number }) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  if (!rows.some((r) => r.type === "FULL_MENU")) {
    writes.push((b) =>
      b.set(db.collection(C.homeSections).doc(), {
        type: "FULL_MENU", title: "Our menu", titleHi: "हमारा मेनू", subtitle: "Everything we make, in one place — tap Add to order",
        collectionId: null, categoryId: null, sortOrder: 0, limit: 30, isActive: true, createdAt: now(), updatedAt: now(),
      }),
    );
  }
  rows.filter((r) => r.type !== "FULL_MENU").forEach((r, i) =>
    writes.push((b) => b.update(r.ref, { sortOrder: i + 1, ...(MENU_DUPLICATES.has(r.type) ? { isActive: false } : {}), updatedAt: now() })),
  );
  await commitInChunks(writes);
  console.log(`  ${writes.length} home section(s) updated`);
}

/** Seeded banners about sample products the shop doesn't sell (matched by their seeded title). */
const OLD_BANNERS = new Set(["Winter mithaas is here", "Wedding season gifting", "Eggless fusion cakes"]);
const SEED_KAJU_SUBTITLE = "Hand-sorted W240 cashews, silver vark, made fresh every morning.";

/**
 * The owner asked for the old sample products to go. Every sample product they don't sell (already
 * hidden by the owner-catalogue migration) is archived — out of the storefront, the console's product
 * and stock lists and the stock alerts, but restorable from Products → Archived; past orders keep
 * their lines. Their leftover sample stock is written off in the stock ledger, the sample collections
 * and the banners about those products are switched off, and the hero shows the owner's own products.
 * Products the owner added or switched back on are never touched.
 */
async function archiveOldProducts(): Promise<void | false> {
  const applied = ((await db.collection("meta").doc("migrations").get()).data()?.applied ?? {}) as Record<string, unknown>;
  if (!applied["2026-11-21-owner-catalogue"]) return false;
  const owner = new Set<string>([...KEEP, ...NEW_PRODUCTS.map((p) => p.slug)]);
  const sample = new Set<string>(PRODUCTS.map((p) => p.slug));
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];

  const archived = new Set<string>();
  for (const d of (await db.collection(C.products).get()).docs) {
    const p = d.data() as { slug: string; isActive?: boolean; deletedAt?: unknown };
    if (!sample.has(p.slug) || owner.has(p.slug) || p.isActive !== false || p.deletedAt) continue;
    archived.add(d.id);
    writes.push((b) => b.update(d.ref, { deletedAt: now(), isActive: false, isFeatured: false, updatedAt: now() }));
  }

  // Write off their remaining sample stock so it no longer counts or raises expiry alerts.
  let units = 0;
  const batches = (await db.collection(C.batches).where("status", "==", "ACTIVE").get()).docs.filter((d) => archived.has(d.data().productId));
  const byVariant = new Map<string, typeof batches>();
  for (const d of batches) byVariant.set(d.data().variantId, [...(byVariant.get(d.data().variantId) ?? []), d]);
  for (const [variantId, list] of byVariant) {
    const invRef = db.collection(C.inventory).doc(variantId);
    let available = ((await invRef.get()).data()?.available as number | undefined) ?? 0;
    for (const d of list) {
      const { remaining, productId } = d.data() as { remaining: number; productId: string };
      writes.push((b) => b.update(d.ref, { status: "DISCARDED", remaining: 0, updatedAt: now() }));
      if (remaining <= 0) continue;
      available = Math.max(0, available - remaining);
      units += remaining;
      const balanceAfter = available;
      writes.push((b) =>
        b.set(db.collection(C.stockTransactions).doc(), {
          variantId, productId, batchId: d.id, type: "ADJUSTMENT", quantity: -remaining, balanceAfter,
          reason: "Sample product removed from the catalogue", orderId: null, createdById: null, createdAt: now(),
        }),
      );
    }
    const finalAvailable = available;
    writes.push((b) => b.update(invRef, { available: finalAvailable, updatedAt: now() }));
  }

  // Sample collections go; any other collection just drops the archived products.
  const offCollections = new Set<string>();
  const sampleCollections = new Set<string>(COLLECTIONS.map((c) => c.slug));
  for (const d of (await db.collection(C.collections).get()).docs) {
    const c = d.data() as { slug: string; isActive?: boolean; products?: { productId: string }[] };
    if (sampleCollections.has(c.slug)) {
      offCollections.add(d.id);
      if (c.isActive !== false) writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));
    } else if ((c.products ?? []).some((x) => archived.has(x.productId))) {
      writes.push((b) => b.update(d.ref, { products: c.products!.filter((x) => !archived.has(x.productId)), updatedAt: now() }));
    }
  }
  for (const d of (await db.collection(C.homeSections).where("type", "==", "FESTIVAL_COLLECTION").get()).docs)
    if (offCollections.has(d.data().collectionId) && d.data().isActive !== false) writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));

  // Banners: the sample ones about old products go; the hero shows the owner's own products.
  const bannerDocs = (await db.collection(C.banners).get()).docs;
  const titles = new Set(bannerDocs.map((d) => d.data().title as string));
  for (const d of bannerDocs) {
    const bn = d.data() as { title: string; subtitle?: string | null; isActive?: boolean };
    if (OLD_BANNERS.has(bn.title) && bn.isActive !== false) writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));
    if (bn.subtitle === SEED_KAJU_SUBTITLE)
      writes.push((b) => b.update(d.ref, { subtitle: "Our cashew katli, packed fresh and delivered to your door.", sortOrder: 0, updatedAt: now() }));
  }
  const heroes = [
    {
      title: "Motichoor laddu & barfi", titleHi: "मोतीचूर लड्डू और बर्फी", eyebrow: "Sweets by the kg",
      subtitle: "Motichoor, boondi, chocolate, vanilla and white barfi — order by weight.", ctaLabel: "See all sweets", ctaLink: "/#menu",
      theme: "rose", sortOrder: 1, imageUrl: photoUrl("motichoor-laddu"),
    },
    {
      title: "Namkeen for every chai break", titleHi: "हर चाय के साथ नमकीन", eyebrow: "Kolhapuri · Ratlami · Moth Bhujia",
      subtitle: "Spicy or mild — freshly packed namkeen by the kg.", ctaLabel: "Shop namkeen", ctaLink: "/category/namkeen",
      theme: "saffron", sortOrder: 2, imageUrl: photoUrl("kolhapuri-namkeen"),
    },
  ];
  for (const h of heroes) {
    if (titles.has(h.title)) continue;
    writes.push((b) =>
      b.set(db.collection(C.banners).doc(), { ...h, placement: "HERO", startsAt: null, endsAt: null, isActive: true, createdAt: now(), updatedAt: now() }),
    );
  }

  await commitInChunks(writes);
  console.log(`  ${archived.size} old product(s) archived, ${units} unit(s) of their sample stock written off`);
}

/**
 * Real photographs replace the drawn artwork wherever the owner hasn't uploaded their own: products
 * whose images are all seeded artwork, categories and banners still showing artwork. Runs on every
 * seed, so photos added later are picked up too; anything the owner changed is left alone.
 */
async function syncCatalogPhotos() {
  if (!existsSync(path.join(PHOTO_DIR, "credits.json"))) return;
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const d of (await db.collection(C.products).get()).docs) {
    const p = d.data() as { slug: string; name: string; images?: { url: string }[] };
    const photos = photoImages(p.slug, p.name);
    if (photos.length && (p.images ?? []).every((im) => isSeedArtwork(im.url))) writes.push((b) => b.update(d.ref, { images: photos, updatedAt: now() }));
  }
  for (const d of (await db.collection(C.categories).get()).docs) {
    const c = d.data() as { slug: string; imageUrl?: string | null };
    const url = CATEGORY_PHOTO[c.slug] && photoUrl(CATEGORY_PHOTO[c.slug]!);
    if (url && (!c.imageUrl || isSeedArtwork(c.imageUrl))) writes.push((b) => b.update(d.ref, { imageUrl: url, updatedAt: now() }));
  }
  for (const d of (await db.collection(C.banners).get()).docs) {
    const url = d.data().imageUrl as string | null | undefined;
    const m = isSeedArtwork(url) ? /^\/static\/catalog\/([a-z0-9-]+)\.svg$/.exec(url as string) : null;
    const photo = m ? photoUrl(m[1]!) : null;
    if (photo) writes.push((b) => b.update(d.ref, { imageUrl: photo, updatedAt: now() }));
  }
  await commitInChunks(writes);
  if (writes.length) console.log(`✓ ${writes.length} record(s) switched to real photos`);
}

/** Opening stock for a new pack: one batch, its stock-in record and the inventory row (0 = out of stock). */
function openingStock(
  writes: ((b: FirebaseFirestore.WriteBatch) => void)[], productId: string, variant: ProductVariant, qty: number, shelfLifeDays: number,
  batchNumber: string, supplierId: string | null,
) {
  if (qty > 0) {
    const batchId = newId();
    const batch: InventoryBatch = {
      variantId: variant.id, productId, batchNumber, supplierId, manufacturedAt: new Date(Date.now() - 3600_000),
      expiresAt: new Date(Date.now() + shelfLifeDays * day), quantity: qty, remaining: qty, costPricePaise: 0, status: "ACTIVE",
      expiryAlertedAt: null, createdAt: now(), updatedAt: now(),
    };
    writes.push((b) => b.set(db.collection(C.batches).doc(batchId), batch));
    writes.push((b) =>
      b.set(db.collection(C.stockTransactions).doc(), {
        variantId: variant.id, productId, batchId, type: "STOCK_IN", quantity: qty, balanceAfter: qty, reason: "Opening stock",
        orderId: null, createdById: null, createdAt: now(),
      }),
    );
  }
  const inv: Inventory = {
    variantId: variant.id, productId, available: qty, reserved: 0, lowStockThreshold: 5, lastRestockedAt: qty > 0 ? now() : null,
    lowStockAlertedAt: null, updatedAt: now(),
  };
  writes.push((b) => b.set(db.collection(C.inventory).doc(variant.id), inv));
}

/**
 * The owner's catalogue (owner-catalogue.ts): keep 13 sample products with the owner's prices, hide the
 * rest (orders keep their history), add the owner's new products, and hide the categories,
 * collections, banners and category coupons that would otherwise lead to empty pages.
 */
async function applyOwnerCatalogue(): Promise<void | false> {
  if (!applyOwnerCatalogueHere) return false;
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  const productDocs = (await db.collection(C.products).get()).docs;
  const bySlug = new Map(productDocs.map((d) => [d.data().slug as string, d]));
  const state = new Map(productDocs.map((d) => [d.id, { slug: d.data().slug as string, categoryId: d.data().categoryId as string, active: d.data().isActive !== false }]));
  const keep = new Set<string>(KEEP);
  const supplierId = (await db.collection(C.suppliers).limit(1).get()).docs[0]?.id ?? null;

  let hidden = 0;
  for (const p of PRODUCTS) {
    const d = bySlug.get(p.slug);
    if (!d || keep.has(p.slug) || d.data().isActive === false) continue;
    writes.push((b) => b.update(d.ref, { isActive: false, isFeatured: false, updatedAt: now() }));
    state.get(d.id)!.active = false;
    hidden++;
  }

  for (const [slug, packs] of Object.entries(PRICES)) {
    const d = bySlug.get(slug);
    if (!d) continue;
    const prod = d.data() as Product;
    const variants = prod.variants.map((v) => ({ ...v }));
    for (const pk of packs) {
      const v = variants.find((x) => x.label === pk.label);
      if (v) {
        v.mrpPaise = rupees(pk.rupees);
        v.salePricePaise = null;
        continue;
      }
      const nv: ProductVariant = {
        id: newId(), label: pk.label, weightGrams: pk.weightGrams, sku: `${prod.sku}-${variants.length + 1}`, barcode: null,
        mrpPaise: rupees(pk.rupees), salePricePaise: null, isActive: true, isDefault: false, sortOrder: 0,
      };
      variants.push(nv);
      writes.push((b) => b.set(db.collection(C.skus).doc(nv.sku), { productId: d.id, variantId: nv.id }));
      openingStock(writes, d.id, nv, 40, prod.shelfLifeDays, `OWN-${nv.sku}`, supplierId);
    }
    const order = (v: ProductVariant) => {
      const i = packs.findIndex((pk) => pk.label === v.label);
      return i === -1 ? packs.length + v.sortOrder : i;
    };
    variants.sort((a, b) => order(a) - order(b)).forEach((v, i) => (v.sortOrder = i));
    for (const v of variants) if (!packs.some((pk) => pk.label === v.label)) console.warn(`  ${slug}: pack "${v.label}" keeps its old price`);
    writes.push((b) => b.update(d.ref, { variants, ...productDerived({ ...prod, variants }), updatedAt: now() }));
  }

  const catDocs = new Map((await db.collection(C.categories).get()).docs.map((d) => [d.data().slug as string, d]));
  let added = 0;
  for (const [i, p] of NEW_PRODUCTS.entries()) {
    const cat = catDocs.get(p.category);
    if (bySlug.has(p.slug) || !cat) continue;
    const productId = newId();
    const sku = `ND-${p.slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${String(101 + i).padStart(3, "0")}`;
    const variants: ProductVariant[] = p.packs.map((pk, vi) => ({
      id: newId(), label: pk.label, weightGrams: pk.weightGrams, sku: `${sku}-${vi + 1}`, barcode: null, mrpPaise: rupees(pk.rupees),
      salePricePaise: null, isActive: true, isDefault: vi === (p.packs.length > 2 ? 1 : 0), sortOrder: vi,
    }));
    const own = photoImages(p.slug, p.name);
    const images = own.length ? own : PHOTO_FALLBACK[p.slug] ? photoImages(PHOTO_FALLBACK[p.slug]!, p.name) : [];
    const base = {
      name: p.name, nameHi: p.nameHi, slug: p.slug, shortDescription: p.short, shortDescriptionHi: null, description: p.description,
      categoryId: cat.id, subcategoryId: null, sku, barcode: null, hsnCode: "21069099", ingredients: UNKNOWN_INGREDIENTS, allergens: [],
      nutrition: null, manufacturingInfo: "Made fresh in the NAAMDEV SWEETS kitchen.", shelfLifeDays: p.shelfLifeDays,
      storageInstructions: p.storage, foodType: "VEG" as const, isFeatured: false, isBestseller: false, isNewArrival: true, isActive: true,
      tags: [...p.tags], videoUrl: null, gstRate: null, avgRating: 0, reviewCount: 0, soldCount: 0, viewCount: 0,
      seoTitle: `${p.name} — Buy Online | NAAMDEV SWEETS`, seoDescription: p.short, deletedAt: null, images, variants,
      createdAt: now(), updatedAt: now(),
    };
    writes.push((b) => b.set(db.collection(C.products).doc(productId), { ...base, ...productDerived(base) }));
    writes.push((b) => b.set(db.collection(C.skus).doc(sku), { productId, variantId: null }));
    for (const v of variants) {
      writes.push((b) => b.set(db.collection(C.skus).doc(v.sku), { productId, variantId: v.id }));
      openingStock(writes, productId, v, p.stock, p.shelfLifeDays, `OWN-${v.sku}`, supplierId);
    }
    state.set(productId, { slug: p.slug, categoryId: cat.id, active: true });
    if (cat.data().isActive === false) writes.push((b) => b.update(cat.ref, { isActive: true, updatedAt: now() }));
    added++;
  }

  // Categories, collections, banners and category coupons that would now lead to empty pages.
  const liveCount = new Map<string, number>();
  for (const s of state.values()) if (s.active) liveCount.set(s.categoryId, (liveCount.get(s.categoryId) ?? 0) + 1);
  const sampleCats = new Set<string>(CATEGORIES.map((c) => c.slug));
  const offCats = new Set<string>();
  const offCatIds = new Set<string>();
  for (const [slug, d] of catDocs) {
    const empty = !liveCount.get(d.id);
    if (empty && sampleCats.has(slug) && d.data().isActive !== false) writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));
    if (empty || d.data().isActive === false) {
      offCats.add(slug);
      offCatIds.add(d.id);
    }
  }
  const offCollections = new Set<string>();
  for (const d of (await db.collection(C.collections).get()).docs) {
    const c = d.data() as { slug: string; isActive?: boolean; products?: { productId: string }[] };
    const any = (c.products ?? []).some((x) => state.get(x.productId)?.active);
    if (!any && c.isActive !== false) writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));
    if (!any || c.isActive === false) offCollections.add(c.slug);
  }
  const liveSlugs = new Set([...state.values()].filter((s) => s.active).map((s) => s.slug));
  for (const d of (await db.collection(C.banners).get()).docs) {
    const bn = d.data() as { title: string; subtitle?: string | null; ctaLink?: string | null; isActive?: boolean };
    if (bn.isActive === false) continue;
    const m = /^\/(category|collections|product)\/([a-z0-9-]+)/.exec(bn.ctaLink ?? "");
    const dead = !!m && ((m[1] === "category" && offCats.has(m[2]!)) || (m[1] === "collections" && offCollections.has(m[2]!)) || (m[1] === "product" && !liveSlugs.has(m[2]!)));
    if (dead || bn.title === "Wedding season gifting") writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));
    else if (bn.title === "Fresh from the kadhai" && bn.subtitle === "Jalebi, samosa and kachori fried to order")
      writes.push((b) => b.update(d.ref, { subtitle: "Jalebi, kachori and mirchi bada, fried fresh", updatedAt: now() }));
  }
  for (const d of (await db.collection(C.coupons).get()).docs) {
    const c = d.data() as { scope?: string; categoryIds?: string[]; isActive?: boolean };
    if (c.isActive !== false && c.scope === "CATEGORY" && (c.categoryIds ?? []).length && c.categoryIds!.every((id) => offCatIds.has(id)))
      writes.push((b) => b.update(d.ref, { isActive: false, updatedAt: now() }));
  }
  await commitInChunks(writes);
  console.log(`  ${hidden} sample product(s) hidden, ${Object.keys(PRICES).length} repriced, ${added} new product(s)`);
}

async function runMigrations() {
  const ref = db.collection("meta").doc("migrations");
  const applied = ((await ref.get()).data()?.applied ?? {}) as Record<string, unknown>;
  for (const m of MIGRATIONS) {
    if (applied[m.id]) continue;
    console.log(`→ migration ${m.id}`);
    if ((await m.run()) === false) {
      console.log("  not ready yet — will run on a later seed");
      continue;
    }
    await ref.set({ applied: { [m.id]: now() } }, { merge: true });
  }
}

export async function seed() {
  console.log(`Seeding NAAMDEV SWEETS (${isProd ? "production" : "development"})…`);
  await seedRoles();
  await seedStoreAndZones();
  await seedCatalog();
  await seedMarketing();
  await seedContent();
  await seedAccounts();
  await runMigrations();
  await syncCatalogPhotos();
  // Tell running API servers the catalogue changed, so they reload it instead of keeping an older copy.
  await db.collection("meta").doc("catalog").set({ products: FieldValue.increment(1), stock: FieldValue.increment(1) }, { merge: true });
  console.log("Done.");
}

const invokedDirectly = process.argv[1] && /seed\.(ts|js|mjs)$/.test(process.argv[1]);
if (invokedDirectly)
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
