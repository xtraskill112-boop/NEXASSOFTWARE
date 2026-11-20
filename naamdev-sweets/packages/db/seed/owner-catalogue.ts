/**
 * The shop owner's own catalogue (November 2026), applied once to the live shop by the seed
 * (migration "2026-11-21-owner-catalogue"). Rates were given per kg (or per piece); pack prices
 * are worked out from them and rounded to the nearest rupee.
 *
 * Ingredients and allergens of the new items are not known yet, so the product pages say so
 * instead of guessing — the owner fills them in from the console.
 */

/** Sample products the owner sells; every other sample product is hidden (not deleted). */
export const KEEP = [
  "motichoor-laddu", "boondi-laddu", "kaju-katli", "chocolate-barfi", "classic-rasgulla", "gulab-jamun", "kala-jamun",
  "kalakand", "jalebi", "soan-papdi", "malai-ghevar", "balushahi", "pyaaz-kachori",
] as const;

export interface PackDef {
  label: string;
  weightGrams: number | null;
  rupees: number;
}

const byWeight = (perKg: number, grams: number[]): PackDef[] =>
  grams.map((g) => ({ label: g >= 1000 ? `${g / 1000} kg` : `${g} g`, weightGrams: g, rupees: Math.round((perKg * g) / 1000) }));
const byPiece = (perPiece: number, counts: number[]): PackDef[] =>
  counts.map((n) => ({ label: n === 1 ? "1 piece" : `Pack of ${n}`, weightGrams: null, rupees: perPiece * n }));

/**
 * New prices for kept products, matched to the existing packs by label (prices only — the packs and
 * their stock stay). Malai Ghevar and Balushahi keep their current prices for now (owner's request).
 * Pyaaz Kachori also gets a single-piece pack.
 */
export const PRICES: Record<string, PackDef[]> = {
  "motichoor-laddu": byWeight(180, [250, 500, 1000, 2000]),
  "boondi-laddu": byWeight(180, [250, 500, 1000]),
  "kaju-katli": byWeight(800, [250, 500, 1000, 2000]),
  "chocolate-barfi": byWeight(280, [250, 500, 1000]),
  "classic-rasgulla": [
    { label: "500 g (8 pcs)", weightGrams: 500, rupees: 90 },
    { label: "1 kg (16 pcs)", weightGrams: 1000, rupees: 180 },
    { label: "2 kg tin (32 pcs)", weightGrams: 2000, rupees: 360 },
  ],
  "gulab-jamun": [
    { label: "500 g (10 pcs)", weightGrams: 500, rupees: 130 },
    { label: "1 kg (20 pcs)", weightGrams: 1000, rupees: 260 },
    { label: "2 kg tin (40 pcs)", weightGrams: 2000, rupees: 520 },
  ],
  "kala-jamun": [
    { label: "500 g (10 pcs)", weightGrams: 500, rupees: 140 },
    { label: "1 kg (20 pcs)", weightGrams: 1000, rupees: 280 },
  ],
  kalakand: byWeight(350, [250, 500, 1000]),
  jalebi: byWeight(140, [250, 500, 1000]),
  "soan-papdi": byWeight(200, [250, 500, 1000]),
  "pyaaz-kachori": byPiece(25, [1, 4, 8]),
};

export interface OwnerProduct {
  name: string;
  nameHi: string;
  slug: string;
  category: string;
  short: string;
  description: string;
  shelfLifeDays: number;
  storage: string;
  packs: PackDef[];
  /** Opening stock per pack; 0 = out of stock. The owner sets the real numbers in Inventory. */
  stock: number;
  tags: string[];
}

const DRY = "Store in a cool, dry place in an airtight container.";
const CHILLED = "Keep refrigerated. Best eaten within the shelf life.";
const FRESH = "Best enjoyed fresh on the day of delivery.";
const UNKNOWN_INGREDIENTS =
  "Ingredient list coming soon. If you have a food allergy, please call us before ordering.";
export { UNKNOWN_INGREDIENTS };

const namkeen = (slug: string, name: string, nameHi: string, spice: string, tags: string[]): OwnerProduct => ({
  name, nameHi, slug, category: "namkeen", short: `${spice} · crunchy namkeen, packed fresh.`,
  description: `${name} — ${spice.toLowerCase()}. Freshly packed crunchy namkeen for chai time, travel and guests.`,
  shelfLifeDays: 60, storage: DRY, packs: byWeight(200, [250, 500, 1000]), stock: 40, tags: ["namkeen", ...tags],
});

export const NEW_PRODUCTS: OwnerProduct[] = [
  {
    name: "Vanilla Barfi", nameHi: "वनीला बर्फी", slug: "vanilla-barfi", category: "barfi",
    short: "Soft milk barfi with a gentle vanilla flavour.", description: "Soft, melt-in-the-mouth milk barfi flavoured with vanilla.",
    shelfLifeDays: 7, storage: CHILLED, packs: byWeight(250, [250, 500, 1000]), stock: 30, tags: ["barfi", "vanilla"],
  },
  {
    name: "White Barfi", nameHi: "सफ़ेद बर्फी", slug: "white-barfi", category: "barfi",
    short: "Classic plain white milk barfi.", description: "Classic white milk barfi — simple, soft and not too sweet.",
    shelfLifeDays: 7, storage: CHILLED, packs: byWeight(250, [250, 500, 1000]), stock: 30, tags: ["barfi", "milk"],
  },
  {
    name: "Mava Katli", nameHi: "मावा कतली", slug: "mava-katli", category: "milk-sweets",
    short: "Rich mava (khoya) katli.", description: "Rich, fudgy katli made from slow-cooked mava (khoya).",
    shelfLifeDays: 7, storage: CHILLED, packs: byWeight(260, [250, 500, 1000]), stock: 30, tags: ["mava", "khoya", "katli"],
  },
  {
    name: "Besan Chakki", nameHi: "बेसन चक्की", slug: "besan-chakki", category: "indian-sweets",
    short: "Traditional besan chakki.", description: "Traditional besan chakki — roasted gram flour sweet cut into pieces.",
    shelfLifeDays: 15, storage: DRY, packs: byWeight(180, [250, 500, 1000]), stock: 30, tags: ["besan"],
  },
  {
    name: "Khurma", nameHi: "खुरमा", slug: "khurma", category: "indian-sweets",
    short: "Crunchy sugar-coated khurma.", description: "Crunchy, sugar-coated khurma — a classic tea-time sweet.",
    shelfLifeDays: 30, storage: DRY, packs: byWeight(150, [250, 500, 1000]), stock: 30, tags: ["khurma"],
  },
  {
    name: "Khopra Pak", nameHi: "खोपरा पाक", slug: "khopra-pak", category: "indian-sweets",
    short: "Coconut (khopra) pak.", description: "Soft coconut (khopra) pak.",
    shelfLifeDays: 10, storage: DRY, packs: byWeight(300, [250, 500, 1000]), stock: 0, tags: ["coconut"],
  },
  {
    name: "Kam Meetha Peda", nameHi: "कम मीठा पेड़ा", slug: "kam-meetha-peda", category: "peda",
    short: "Peda with less sugar.", description: "Our peda made with less sugar, for those who like it mildly sweet.",
    shelfLifeDays: 7, storage: CHILLED, packs: byWeight(260, [250, 500, 1000]), stock: 30, tags: ["peda", "less sugar"],
  },
  {
    name: "Dal Kachori", nameHi: "दाल कचौरी", slug: "dal-kachori", category: "snacks",
    short: "Crisp kachori with a spiced dal filling.", description: "Crisp, flaky kachori filled with spiced dal. Fried fresh.",
    shelfLifeDays: 1, storage: FRESH, packs: byPiece(10, [1, 4, 8]), stock: 40, tags: ["kachori", "snacks"],
  },
  {
    name: "Mirchi Bada", nameHi: "मिर्ची बड़ा", slug: "mirchi-bada", category: "snacks",
    short: "Stuffed green chilli fried in besan batter.", description: "Big green chilli stuffed and fried in besan batter — Rajasthani style.",
    shelfLifeDays: 1, storage: FRESH, packs: byPiece(20, [1, 4, 8]), stock: 40, tags: ["mirchi bada", "snacks", "spicy"],
  },
  namkeen("kolhapuri-namkeen", "Kolhapuri Namkeen", "कोल्हापुरी नमकीन", "Extra spicy", ["spicy", "kolhapuri"]),
  namkeen("ratlami-namkeen", "Ratlami Namkeen", "रतलामी नमकीन", "Medium spicy", ["ratlami"]),
  namkeen("moth-bhujia", "Moth Bhujia", "मोठ भुजिया", "Medium spicy", ["bhujia", "moth"]),
  namkeen("haath-wali-namkeen", "Haath Wali Namkeen", "हाथ वाली नमकीन", "Medium spicy", ["handmade"]),
  namkeen("tasty-namkeen", "Tasty Namkeen", "टेस्टी नमकीन", "Medium spicy", []),
  namkeen("mixture-namkeen", "Mixture", "मिक्सचर", "Medium spicy", ["mixture"]),
  namkeen("spicy-mixture-namkeen", "Teekha Mixture", "तीखा मिक्सचर", "Extra spicy", ["mixture", "spicy"]),
];

/** Pictures borrowed from a similar item until the owner uploads their own (new slug → photo name). */
export const PHOTO_FALLBACK: Record<string, string> = {
  "mixture-namkeen": "navratan-mixture",
  "spicy-mixture-namkeen": "khatta-meetha",
  "white-barfi": "coconut-barfi",
  "vanilla-barfi": "kesar-pista-barfi",
  "kam-meetha-peda": "mathura-peda",
};
