/* eslint-disable no-console */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS, DEFAULT_SETTINGS, PERMISSIONS, SYSTEM_ROLES } from "@naamdev/shared";
import { CATEGORIES, COLLECTIONS, PRODUCTS } from "./catalog";
import { CONTENT_PAGES, FAQS } from "./content";

const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === "production";
const seedDemo = process.env.SEED_DEMO_ACCOUNTS ? process.env.SEED_DEMO_ACCOUNTS === "true" : !isProd;
const demoPassword = process.env.SEED_DEMO_PASSWORD || "Naamdev@123";
const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProd ? "" : "Naamdev@123");
const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@naamdevsweets.local").toLowerCase();
const adminPhone = process.env.SEED_ADMIN_PHONE || "+919000000001";

const referralCode = () => "ND" + randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
const rupees = (r: number) => Math.round(r * 100);
const day = 86_400_000;

async function seedRbac() {
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { group: meta.group, description: meta.description },
      create: { key, group: meta.group, description: meta.description },
    });
  }
  const perms = await prisma.permission.findMany();
  const byKey = new Map(perms.map((p) => [p.key, p.id]));
  for (const role of SYSTEM_ROLES) {
    const r = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, isSystem: true, isStaff: role.isStaff },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true, isStaff: role.isStaff },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    if (role.permissions.length)
      await prisma.rolePermission.createMany({
        data: role.permissions.filter((p) => byKey.has(p)).map((p) => ({ roleId: r.id, permissionId: byKey.get(p)! })),
      });
  }
  console.log(`✓ ${ALL_PERMISSIONS.length} permissions, ${SYSTEM_ROLES.length} roles`);
}

async function upsertUser(opts: { name: string; email: string; phone: string; password: string; role: string; designation?: string; code?: string }) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: opts.role } });
  const passwordHash = await hash(opts.password);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { roleId: role.id, name: opts.name },
    create: {
      name: opts.name,
      email: opts.email,
      phone: opts.phone,
      passwordHash,
      roleId: role.id,
      referralCode: referralCode(),
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      profile: { create: {} },
    },
  });
  if (opts.designation) {
    const store = await prisma.store.findFirst({ where: { isDefault: true } });
    await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: { designation: opts.designation },
      create: { userId: user.id, designation: opts.designation, employeeCode: opts.code!, storeId: store?.id },
    });
  }
  return user;
}

async function seedStoreAndZones() {
  await prisma.store.upsert({
    where: { code: "JPR-01" },
    update: {},
    create: {
      name: "NAAMDEV SWEETS — Flagship Kitchen",
      code: "JPR-01",
      addressLine: "MI Road, near Panch Batti",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302001",
      lat: 26.9157,
      lng: 75.8069,
      phone: "+911414000000",
      email: "kitchen@naamdevsweets.com",
      isDefault: true,
    },
  });
  const zones = [
    ["302001", "MI Road / Ajmeri Gate", 30], ["302002", "Johari Bazaar", 35], ["302003", "Ramganj", 40],
    ["302004", "Raja Park / Adarsh Nagar", 35], ["302005", "Civil Lines", 35], ["302006", "Bani Park", 30],
    ["302012", "Jhotwara", 50], ["302015", "Tonk Phatak / Gandhi Nagar", 40], ["302016", "Shastri Nagar", 40],
    ["302017", "Malviya Nagar", 45], ["302018", "Durgapura", 50], ["302019", "Shyam Nagar", 45],
    ["302020", "Mansarovar", 55], ["302021", "Vaishali Nagar", 50], ["302022", "Sanganer", 60],
    ["302023", "Vidhyadhar Nagar", 45], ["302025", "Jagatpura", 60], ["302039", "Murlipura", 50],
  ] as const;
  for (const [pincode, area, eta] of zones) {
    await prisma.deliveryZone.upsert({
      where: { pincode },
      update: {},
      create: { pincode, area, city: "Jaipur", etaMinutes: eta, deliveryFeePaise: eta >= 55 ? 6900 : null },
    });
  }
  console.log(`✓ store + ${zones.length} delivery zones`);
}

async function seedCatalog() {
  const catIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, nameHi: c.nameHi, accentColor: c.accent, gstRate: c.gst, description: c.description, sortOrder: i },
      create: {
        slug: c.slug, name: c.name, nameHi: c.nameHi, description: c.description, accentColor: c.accent,
        gstRate: c.gst, sortOrder: i, imageUrl: `/static/catalog/category-${c.slug}.svg`,
      },
    });
    catIds.set(c.slug, cat.id);
  }

  const supplierDefs = [
    { name: "Shree Krishna Dairy Farms", contactPerson: "Mahesh Yadav", phone: "+919800000101", gstin: null, address: "Bassi, Jaipur" },
    { name: "Kesar Dry Fruit Traders", contactPerson: "Anil Agarwal", phone: "+919800000102", gstin: null, address: "Johari Bazaar, Jaipur" },
    { name: "Marwar Packaging Co.", contactPerson: "Sunita Rathore", phone: "+919800000103", gstin: null, address: "Sitapura Industrial Area, Jaipur" },
  ];
  const suppliers = [];
  for (const s of supplierDefs) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    suppliers.push(existing ?? (await prisma.supplier.create({ data: s })));
  }

  const now = Date.now();
  let variantCount = 0;
  for (const [pi, p] of PRODUCTS.entries()) {
    const catId = catIds.get(p.category)!;
    const sku = `ND-${p.slug.split("-").map((w) => w[0]).join("").toUpperCase()}-${String(pi + 1).padStart(3, "0")}`;
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) continue;
    const product = await prisma.product.create({
      data: {
        name: p.name, nameHi: p.nameHi, slug: p.slug, shortDescription: p.short, shortDescriptionHi: p.shortHi,
        description: p.description, categoryId: catId, sku, hsnCode: p.hsn ?? "21069099", ingredients: p.ingredients,
        allergens: p.allergens, nutrition: p.nutrition ?? undefined, shelfLifeDays: p.shelfLifeDays,
        storageInstructions: p.storage, foodType: p.foodType ?? "VEG",
        manufacturingInfo: "Manufactured & packed by Naamdev Sweets Pvt. Ltd., Flagship Kitchen, MI Road, Jaipur 302001. FSSAI Lic. No. to be updated by the business.",
        isFeatured: !!p.flags?.featured, isBestseller: !!p.flags?.bestseller, isNewArrival: !!p.flags?.newArrival,
        tags: p.tags ?? [], gstRate: p.gstRate ?? null,
        seoTitle: `${p.name} — Buy Online | NAAMDEV SWEETS`,
        seoDescription: p.short,
        images: {
          create: [
            { url: `/static/catalog/${p.slug}.svg`, alt: p.name, sortOrder: 0, width: 800, height: 800 },
            { url: `/static/catalog/${p.slug}-alt.svg`, alt: `${p.name} — close-up`, sortOrder: 1, width: 800, height: 800 },
          ],
        },
      },
    });
    for (const [vi, v] of p.variants.entries()) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id, label: v.label, weightGrams: v.weightGrams, sku: `${sku}-${vi + 1}`,
          mrpPaise: rupees(v.mrp), salePricePaise: v.sale ? rupees(v.sale) : null,
          isDefault: vi === (p.variants.length > 2 ? 1 : 0), sortOrder: vi,
        },
      });
      variantCount++;
      // Two batches per variant: an older one (FEFO consumes first) and a fresh one.
      const shelf = p.shelfLifeDays * day;
      const olderQty = Math.max(2, Math.round(v.stock * 0.3));
      const freshQty = v.stock - olderQty;
      const supplier = suppliers[pi % suppliers.length]!;
      const olderMfg = new Date(now - Math.min(shelf * 0.6, 20 * day));
      const batches = [
        { no: `B${String(pi + 1).padStart(3, "0")}${vi + 1}A`, qty: olderQty, mfg: olderMfg, exp: new Date(olderMfg.getTime() + shelf) },
        { no: `B${String(pi + 1).padStart(3, "0")}${vi + 1}B`, qty: freshQty, mfg: new Date(now - 6 * 3600_000), exp: new Date(now - 6 * 3600_000 + shelf) },
      ].filter((b) => b.qty > 0 && b.exp.getTime() > now);
      let running = 0;
      for (const b of batches) {
        const batch = await prisma.inventoryBatch.create({
          data: {
            variantId: variant.id, batchNumber: b.no, supplierId: supplier.id, manufacturedAt: b.mfg, expiresAt: b.exp,
            quantity: b.qty, remaining: b.qty, costPricePaise: Math.round(rupees(v.sale ?? v.mrp) * 0.55),
          },
        });
        running += b.qty;
        await prisma.stockTransaction.create({
          data: { variantId: variant.id, batchId: batch.id, type: "STOCK_IN", quantity: b.qty, balanceAfter: running, reason: "Opening stock" },
        });
      }
      await prisma.inventory.create({
        data: { variantId: variant.id, available: running, lowStockThreshold: Math.max(5, Math.round(v.stock * 0.15)), lastRestockedAt: new Date() },
      });
    }
  }
  console.log(`✓ ${CATEGORIES.length} categories, ${PRODUCTS.length} products, ${variantCount} new variants`);

  for (const c of COLLECTIONS) {
    const products = await prisma.product.findMany({ where: { slug: { in: c.products } }, select: { id: true, slug: true } });
    const col = await prisma.collection.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug, name: c.name, nameHi: c.nameHi, description: c.description, theme: c.theme, isFestival: c.isFestival,
        bannerImageUrl: `/static/catalog/collection-${c.slug}.svg`,
      },
    });
    for (const p of products)
      await prisma.collectionProduct.upsert({
        where: { collectionId_productId: { collectionId: col.id, productId: p.id } },
        update: {},
        create: { collectionId: col.id, productId: p.id, sortOrder: c.products.indexOf(p.slug) },
      });
  }
  console.log(`✓ ${COLLECTIONS.length} collections`);
}

async function seedMarketing() {
  const cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
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
    const { categories, ...rest } = c as typeof c & { categories?: readonly string[] };
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: {
        ...rest,
        type: rest.type,
        startsAt: start,
        endsAt: end,
        categories: categories ? { connect: categories.map((s) => ({ id: cats[s]! })) } : undefined,
      } as never,
    });
  }

  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.createMany({
      data: [
        { title: "Winter mithaas is here", titleHi: "सर्दियों की मिठास आ गई", eyebrow: "Til · Gud · Ghee", subtitle: "Til laddu, gond laddu, gajak and pinni — slow-made with pure desi ghee.", ctaLabel: "Shop winter specials", ctaLink: "/collections/winter-specials", theme: "saffron", placement: "HERO", sortOrder: 0, imageUrl: "/static/catalog/til-gud-laddu.svg" },
        { title: "Wedding season gifting", titleHi: "शादी के मौसम के उपहार", eyebrow: "Up to 20% off · SHAGUN20", subtitle: "Royal hampers and shagun boxes, personalised for your big day.", ctaLabel: "Explore hampers", ctaLink: "/collections/wedding-season", theme: "maroon", placement: "HERO", sortOrder: 1, imageUrl: "/static/catalog/royal-celebration-hamper.svg" },
        { title: "The Kaju Katli everyone talks about", titleHi: "सबकी पसंदीदा काजू कतली", eyebrow: "Bestseller · 10% off with KAJU10", subtitle: "Hand-sorted W240 cashews, silver vark, made fresh every morning.", ctaLabel: "Order now", ctaLink: "/product/kaju-katli", theme: "royal", placement: "HERO", sortOrder: 2, imageUrl: "/static/catalog/kaju-katli.svg" },
        { title: "₹100 off your first order", subtitle: "Use WELCOME100 on orders above ₹499", ctaLabel: "WELCOME100", ctaLink: "/offers", theme: "pistachio", placement: "OFFER_STRIP", sortOrder: 0 },
        { title: "Free delivery above ₹999", subtitle: "Across all serviceable Jaipur pincodes", ctaLabel: "Learn more", ctaLink: "/pages/shipping-policy", theme: "gold", placement: "OFFER_STRIP", sortOrder: 1 },
        { title: "Fresh from the kadhai", subtitle: "Jalebi, samosa and kachori fried to order", ctaLabel: "Order hot snacks", ctaLink: "/category/snacks", theme: "rose", placement: "PROMO_GRID", sortOrder: 0, imageUrl: "/static/catalog/jalebi.svg" },
        { title: "Eggless fusion cakes", subtitle: "Rasmalai cake, gulab jamun cheesecake & more", ctaLabel: "See cakes", ctaLink: "/category/cakes", theme: "midnight", placement: "PROMO_GRID", sortOrder: 1, imageUrl: "/static/catalog/rasmalai-fusion-cake.svg" },
      ],
    });
  }

  if ((await prisma.homeSection.count()) === 0) {
    const winter = await prisma.collection.findUnique({ where: { slug: "winter-specials" } });
    const wedding = await prisma.collection.findUnique({ where: { slug: "wedding-season" } });
    const sections = [
      { type: "CATEGORY_GRID", title: "What's your craving?", titleHi: "आज क्या खाने का मन है?" },
      { type: "OFFERS", title: "Offers for you", titleHi: "आपके लिए ऑफ़र" },
      { type: "RECENTLY_VIEWED", title: "Recently viewed", titleHi: "हाल ही में देखे गए" },
      { type: "BESTSELLERS", title: "Bestselling sweets", titleHi: "बेस्टसेलर मिठाइयाँ", subtitle: "The sweets Jaipur can't stop ordering" },
      { type: "FESTIVAL_COLLECTION", title: "Winter specials", titleHi: "सर्दियों की ख़ास", subtitle: "Til, gud & ghee — made for the season", collectionId: winter?.id },
      { type: "FREQUENTLY_PURCHASED", title: "Order again", titleHi: "फिर से ऑर्डर करें" },
      { type: "NEW_ARRIVALS", title: "Fresh arrivals", titleHi: "नई मिठाइयाँ", subtitle: "New on the menu this season" },
      { type: "GIFT_HAMPERS", title: "Gift hampers", titleHi: "गिफ्ट हैम्पर", subtitle: "Handcrafted boxes for every occasion", categoryId: cats["gift-hampers"] },
      { type: "TRENDING", title: "Trending this week", titleHi: "इस हफ़्ते ट्रेंडिंग" },
      { type: "FESTIVAL_COLLECTION", title: "Wedding season gifting", titleHi: "शादी के उपहार", collectionId: wedding?.id },
      { type: "RECOMMENDED", title: "Recommended for you", titleHi: "आपके लिए सुझाव" },
      { type: "FAVOURITES", title: "Customer favourites", titleHi: "ग्राहकों की पसंद", subtitle: "Highest rated by our customers" },
      { type: "POPULAR", title: "Popular near you", titleHi: "आपके पास लोकप्रिय" },
    ] as const;
    await prisma.homeSection.createMany({ data: sections.map((s, i) => ({ ...s, sortOrder: i, limit: 10 })) as never });
  }
  console.log("✓ coupons, banners, home sections");
}

async function seedContent() {
  for (const p of CONTENT_PAGES)
    await prisma.contentPage.upsert({ where: { slug: p.slug }, update: {}, create: p });
  if ((await prisma.faq.count()) === 0) await prisma.faq.createMany({ data: FAQS.map((f, i) => ({ ...f, sortOrder: i })) });
  const store = await prisma.store.findFirst({ where: { isDefault: true } });
  const settings = {
    ...DEFAULT_SETTINGS,
    storeProfile: {
      ...DEFAULT_SETTINGS.storeProfile,
      phone: store?.phone ?? "",
      address: store ? `${store.addressLine}, ${store.city}, ${store.state} ${store.pincode}` : "",
    },
    social: { instagram: "https://instagram.com/", facebook: "https://facebook.com/", youtube: "https://youtube.com/" },
  };
  for (const [key, value] of Object.entries(settings))
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
  console.log(`✓ ${CONTENT_PAGES.length} content pages, ${FAQS.length} FAQs, settings`);
}

async function seedAccounts() {
  if (!adminPassword) {
    console.warn("! SEED_ADMIN_PASSWORD not set — skipping super admin creation in production.");
  } else {
    await upsertUser({ name: "Super Admin", email: adminEmail, phone: adminPhone, password: adminPassword, role: "SUPER_ADMIN", designation: "Platform Administrator", code: "ND-ADMIN" });
    console.log(`✓ super admin ${adminEmail}`);
  }
  if (!seedDemo) return;
  const staff = [
    ["Store Owner (Demo)", "owner", "+919000000002", "STORE_OWNER", "Owner"],
    ["Store Manager (Demo)", "manager", "+919000000003", "STORE_MANAGER", "Store Manager"],
    ["Order Manager (Demo)", "orders", "+919000000004", "ORDER_MANAGER", "Order Manager"],
    ["Inventory Manager (Demo)", "inventory", "+919000000005", "INVENTORY_MANAGER", "Inventory Manager"],
    ["Packing Staff (Demo)", "packing", "+919000000006", "PACKING_STAFF", "Packing Lead"],
    ["Support Agent (Demo)", "support", "+919000000007", "SUPPORT_AGENT", "Customer Support"],
  ] as const;
  for (const [i, [name, handle, phone, role, designation]] of staff.entries())
    await upsertUser({ name, email: `${handle}@naamdevsweets.local`, phone, password: demoPassword, role, designation, code: `ND-${String(101 + i)}` });

  const rider = await upsertUser({ name: "Demo Rider", email: "rider@naamdevsweets.local", phone: "+919000000010", password: demoPassword, role: "DELIVERY_PARTNER" });
  await prisma.deliveryPartner.upsert({
    where: { userId: rider.id },
    update: {},
    create: { userId: rider.id, status: "APPROVED", vehicleType: "SCOOTER", vehicleNumber: "RJ14 AB 0000", city: "Jaipur", approvedAt: new Date(), currentLat: 26.9124, currentLng: 75.7873 },
  });
  const pending = await upsertUser({ name: "Pending Rider (Demo)", email: "rider2@naamdevsweets.local", phone: "+919000000011", password: demoPassword, role: "DELIVERY_PARTNER" });
  await prisma.deliveryPartner.upsert({
    where: { userId: pending.id },
    update: {},
    create: { userId: pending.id, status: "PENDING", vehicleType: "MOTORCYCLE", city: "Jaipur" },
  });

  const customer = await upsertUser({ name: "Demo Customer", email: "customer@naamdevsweets.local", phone: "+919000000100", password: demoPassword, role: "CUSTOMER" });
  if ((await prisma.address.count({ where: { userId: customer.id } })) === 0)
    await prisma.address.create({
      data: {
        userId: customer.id, type: "HOME", fullName: "Demo Customer", phone: "+919000000100", line1: "Flat 12, Demo Residency",
        line2: "Ashok Marg, C-Scheme", landmark: "Near Statue Circle", city: "Jaipur", state: "Rajasthan", pincode: "302001",
        lat: 26.9056, lng: 75.8031, isDefault: true,
      },
    });
  console.log(`✓ demo staff (${staff.length}), 2 delivery partners, 1 demo customer — password: ${demoPassword}`);
}

async function main() {
  console.log(`Seeding NAAMDEV SWEETS (${isProd ? "production" : "development"})…`);
  await seedRbac();
  await seedStoreAndZones();
  await seedCatalog();
  await seedMarketing();
  await seedContent();
  await seedAccounts();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
