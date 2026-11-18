/**
 * Launch catalogue for NAAMDEV SWEETS. Used by the seed script and by the illustration
 * generator (scripts/generate-assets.mjs) so every product has matching artwork.
 * Prices are in rupees here and converted to paise by the seed.
 */

export type ArtKind =
  | "laddu" | "barfi" | "katli" | "roll" | "peda" | "syrupBalls" | "rasmalai" | "jalebi" | "cubes"
  | "ghevar" | "sandesh" | "bowl" | "pot" | "dryfruits" | "namkeen" | "triangles" | "rounds" | "dhokla"
  | "cake" | "hamper" | "combo";

export interface Art {
  kind: ArtKind;
  /** primary, secondary, garnish colours */
  colors: [string, string, string];
  bg: [string, string];
}

export interface CatalogVariant {
  label: string;
  weightGrams?: number;
  mrp: number;
  sale?: number;
  stock: number;
}

export interface CatalogProduct {
  name: string;
  nameHi: string;
  slug: string;
  category: string;
  short: string;
  shortHi?: string;
  description: string;
  ingredients: string;
  allergens: string[];
  shelfLifeDays: number;
  storage: string;
  art: Art;
  variants: CatalogVariant[];
  flags?: { featured?: boolean; bestseller?: boolean; newArrival?: boolean };
  tags?: string[];
  nutrition?: Record<string, string>;
  gstRate?: number;
  hsn?: string;
  foodType?: "VEG" | "EGG" | "NON_VEG";
}

export const CATEGORIES = [
  { slug: "indian-sweets", name: "Indian Sweets", nameHi: "भारतीय मिठाइयाँ", accent: "#F57F0E", gst: 5, description: "Timeless classics from every corner of India." },
  { slug: "bengali-sweets", name: "Bengali Sweets", nameHi: "बंगाली मिठाइयाँ", accent: "#E8D9B5", gst: 5, description: "Soft chhena delicacies, the Kolkata way." },
  { slug: "kaju-sweets", name: "Kaju Sweets", nameHi: "काजू मिठाइयाँ", accent: "#C9C3B8", gst: 5, description: "Premium cashew creations finished with silver vark." },
  { slug: "milk-sweets", name: "Milk Sweets", nameHi: "दूध की मिठाइयाँ", accent: "#F3E4C4", gst: 5, description: "Slow-cooked khoya and rabri goodness." },
  { slug: "dry-fruits", name: "Dry Fruits", nameHi: "सूखे मेवे", accent: "#B7793A", gst: 5, description: "Hand-sorted premium nuts and dry fruits." },
  { slug: "laddu", name: "Laddu", nameHi: "लड्डू", accent: "#F39C12", gst: 5, description: "Round, golden and made for celebrations." },
  { slug: "barfi", name: "Barfi", nameHi: "बर्फी", accent: "#9BBF6A", gst: 5, description: "Melt-in-mouth squares in classic and modern flavours." },
  { slug: "peda", name: "Peda", nameHi: "पेड़ा", accent: "#D9A25F", gst: 5, description: "Temple-style pedas, rich and fragrant." },
  { slug: "rasgulla", name: "Rasgulla", nameHi: "रसगुल्ला", accent: "#F7F1E3", gst: 5, description: "Spongy, syrupy and irresistibly light." },
  { slug: "gulab-jamun", name: "Gulab Jamun", nameHi: "गुलाब जामुन", accent: "#8B3A1E", gst: 5, description: "Warm, rose-scented and soaked to perfection." },
  { slug: "namkeen", name: "Namkeen", nameHi: "नमकीन", accent: "#E0A526", gst: 12, description: "Crunchy savouries for every chai break." },
  { slug: "snacks", name: "Snacks", nameHi: "स्नैक्स", accent: "#D4821F", gst: 5, description: "Fresh samosas, kachoris and tea-time treats." },
  { slug: "cakes", name: "Cakes", nameHi: "केक", accent: "#A0522D", gst: 18, description: "Eggless fusion cakes with an Indian heart." },
  { slug: "gift-hampers", name: "Gift Hampers", nameHi: "गिफ्ट हैम्पर", accent: "#8F1D34", gst: 5, description: "Luxurious hampers for weddings, festivals and corporate gifting." },
  { slug: "special-combos", name: "Special Combos", nameHi: "स्पेशल कॉम्बो", accent: "#B22A42", gst: 5, description: "Curated combos at special prices." },
] as const;

const BG = {
  saffron: ["#FFE7C2", "#FFC983"] as [string, string],
  cream: ["#FFF6E6", "#F7E2BC"] as [string, string],
  rose: ["#FFE4E1", "#F8C1C8"] as [string, string],
  pista: ["#EEF5DD", "#CFE3A8"] as [string, string],
  maroon: ["#F9D9DE", "#E7A4AE"] as [string, string],
  gold: ["#FFF1C9", "#F3D27A"] as [string, string],
  cocoa: ["#F3E0D2", "#DDB79C"] as [string, string],
  sky: ["#E5F0FA", "#C3DBF0"] as [string, string],
};

/** Weight variants priced per kg. Rounded to the nearest ₹5. */
function kg(perKg: number, stock: number, opts: { discount?: number; sizes?: number[] } = {}): CatalogVariant[] {
  const sizes = opts.sizes ?? [250, 500, 1000];
  return sizes.map((g, i) => {
    const mrp = Math.round((perKg * g) / 1000 / 5) * 5;
    const sale = opts.discount ? Math.round((mrp * (1 - opts.discount)) / 5) * 5 : undefined;
    const label = g >= 1000 ? `${g / 1000} kg` : `${g} g`;
    return { label, weightGrams: g, mrp, sale, stock: Math.max(6, Math.round(stock / (i + 1))) };
  });
}

const DAIRY = "Store refrigerated between 2–6°C. Consume within the shelf life once opened.";
const DRY = "Store in a cool, dry place away from sunlight in an airtight container.";
const SYRUP = "Refrigerate after opening. Serve chilled or warm as preferred. Keep immersed in syrup.";
const FRESH = "Best enjoyed fresh on the day of delivery. Reheat lightly before serving.";

export const PRODUCTS: CatalogProduct[] = [
  // ── Kaju sweets
  {
    name: "Kaju Katli", nameHi: "काजू कतली", slug: "kaju-katli", category: "kaju-sweets",
    short: "Diamond-cut cashew fudge finished with pure silver vark.",
    shortHi: "चाँदी के वर्क वाली हीरे के आकार की काजू कतली।",
    description: "Our signature Kaju Katli is made from hand-sorted W240 cashews, ground fresh each morning and cooked low and slow with just enough sugar. Rolled thin, finished with edible silver vark and cut into the classic diamond — smooth, rich and never overly sweet.",
    ingredients: "Cashew nuts (65%), sugar, pure ghee, edible silver leaf (vark), cardamom.",
    allergens: ["Cashew (tree nuts)", "Milk (ghee)"], shelfLifeDays: 15, storage: DRY,
    art: { kind: "katli", colors: ["#EFE6D6", "#D9CDB8", "#C0C4CC"], bg: BG.gold },
    variants: kg(1200, 120, { discount: 0.08, sizes: [250, 500, 1000, 2000] }),
    flags: { featured: true, bestseller: true }, tags: ["signature", "silver vark", "diwali", "gifting"],
    nutrition: { "Energy": "520 kcal", "Protein": "10 g", "Carbohydrates": "58 g", "Sugar": "42 g", "Fat": "28 g" },
    hsn: "17049020",
  },
  {
    name: "Kaju Pista Roll", nameHi: "काजू पिस्ता रोल", slug: "kaju-pista-roll", category: "kaju-sweets",
    short: "Cashew rolls with a vibrant pistachio heart.",
    description: "Silky cashew dough wrapped around a fragrant pistachio and cardamom filling, rolled by hand and sliced into jewel-like rounds. A favourite in our festive boxes.",
    ingredients: "Cashew nuts, pistachio (18%), sugar, ghee, cardamom, edible silver leaf.",
    allergens: ["Cashew", "Pistachio", "Milk"], shelfLifeDays: 15, storage: DRY,
    art: { kind: "roll", colors: ["#EFE3CF", "#8DB255", "#C0C4CC"], bg: BG.pista },
    variants: kg(1400, 70, { sizes: [250, 500, 1000] }), flags: { featured: true }, tags: ["pistachio", "gifting"],
    hsn: "17049020",
  },
  {
    name: "Kaju Anjeer Roll", nameHi: "काजू अंजीर रोल", slug: "kaju-anjeer-roll", category: "kaju-sweets",
    short: "Cashew rolls filled with figs — naturally sweet and wholesome.",
    description: "Sun-dried Afghan figs slow-cooked into a jammy centre and wrapped in a delicate cashew shell. Lightly sweetened with the fig's own sugars.",
    ingredients: "Cashew nuts, dried figs (25%), sugar, ghee, poppy seeds.",
    allergens: ["Cashew", "Milk"], shelfLifeDays: 20, storage: DRY,
    art: { kind: "roll", colors: ["#EADBC4", "#8A4B2A", "#E8D3A8"], bg: BG.cocoa },
    variants: kg(1500, 50), flags: { newArrival: true }, tags: ["fig", "less sugar"],
    hsn: "17049020",
  },
  // ── Laddu
  {
    name: "Motichoor Laddu", nameHi: "मोतीचूर लड्डू", slug: "motichoor-laddu", category: "laddu",
    short: "Tiny pearls of boondi fried in ghee, bound with saffron syrup.",
    shortHi: "घी में तली बारीक बूँदी से बने केसरिया लड्डू।",
    description: "Hundreds of fine gram-flour pearls fried in pure desi ghee, soaked in saffron-cardamom syrup and shaped by hand. Finished with melon seeds and pistachio slivers — the laddu of every Indian celebration.",
    ingredients: "Gram flour, sugar, pure ghee, melon seeds, pistachio, saffron, cardamom.",
    allergens: ["Milk (ghee)", "Pistachio"], shelfLifeDays: 7, storage: DRY,
    art: { kind: "laddu", colors: ["#F59E1B", "#E2800C", "#7FA34A"], bg: BG.saffron },
    variants: kg(520, 140, { sizes: [250, 500, 1000, 2000] }),
    flags: { bestseller: true, featured: true }, tags: ["pooja", "wedding", "ghee"],
    nutrition: { "Energy": "455 kcal", "Protein": "6 g", "Carbohydrates": "60 g", "Sugar": "44 g", "Fat": "21 g" },
  },
  {
    name: "Besan Laddu", nameHi: "बेसन लड्डू", slug: "besan-laddu", category: "laddu",
    short: "Roasted gram flour laddu with a nutty, ghee-rich aroma.",
    description: "Coarse besan slow-roasted in desi ghee until deep golden and aromatic, then blended with powdered sugar and cardamom. Hand-rolled the traditional way.",
    ingredients: "Gram flour, pure ghee, sugar, cardamom, almonds.",
    allergens: ["Milk (ghee)", "Almond"], shelfLifeDays: 20, storage: DRY,
    art: { kind: "laddu", colors: ["#E7B04A", "#C98A2A", "#F3E1B0"], bg: BG.gold },
    variants: kg(560, 110), flags: { bestseller: true }, tags: ["ghee", "classic"],
  },
  {
    name: "Dry Fruit Laddu", nameHi: "ड्राई फ्रूट लड्डू", slug: "dry-fruit-laddu", category: "laddu",
    short: "No-added-sugar laddu of dates, figs and premium nuts.",
    description: "A wholesome blend of Medjool dates, figs, almonds, cashews, pistachios and walnuts bound together without added sugar. Energy-packed and perfect for gifting.",
    ingredients: "Dates, figs, almonds, cashews, pistachios, walnuts, ghee, poppy seeds.",
    allergens: ["Tree nuts", "Milk (ghee)"], shelfLifeDays: 30, storage: DRY,
    art: { kind: "laddu", colors: ["#7B4A2B", "#5C3520", "#D9B27C"], bg: BG.cocoa },
    variants: kg(1100, 60), flags: { featured: true }, tags: ["no added sugar", "healthy", "winter"],
  },
  {
    name: "Boondi Laddu", nameHi: "बूंदी लड्डू", slug: "boondi-laddu", category: "laddu",
    short: "Temple-style boondi laddu, perfect for prasad.",
    description: "Plump boondi soaked in light sugar syrup with cloves and cardamom — the beloved prasad laddu, made fresh for pooja and celebrations.",
    ingredients: "Gram flour, sugar, ghee, cashew, raisins, cloves, cardamom.",
    allergens: ["Milk (ghee)", "Cashew"], shelfLifeDays: 7, storage: DRY,
    art: { kind: "laddu", colors: ["#F2A516", "#D9850B", "#B5462D"], bg: BG.saffron },
    variants: kg(440, 100), tags: ["prasad", "pooja"],
  },
  {
    name: "Til Gud Laddu", nameHi: "तिल गुड़ लड्डू", slug: "til-gud-laddu", category: "laddu",
    short: "Roasted sesame and jaggery laddu — the taste of winter.",
    description: "Toasted white sesame bound with organic jaggery and a touch of ghee. A Makar Sankranti essential that keeps you warm through winter.",
    ingredients: "Sesame seeds (55%), jaggery, ghee, peanuts, cardamom.",
    allergens: ["Sesame", "Peanut", "Milk (ghee)"], shelfLifeDays: 45, storage: DRY,
    art: { kind: "laddu", colors: ["#C98B4B", "#A76A31", "#F4E8D0"], bg: BG.cocoa },
    variants: kg(480, 90), flags: { newArrival: true }, tags: ["winter", "sankranti", "jaggery"],
  },
  {
    name: "Gond Laddu", nameHi: "गोंद के लड्डू", slug: "gond-laddu", category: "laddu",
    short: "Edible gum, whole wheat and dry fruits — a winter tonic.",
    description: "A Rajasthani winter tradition: edible gum fried in ghee, whole wheat flour, dry fruits and dry ginger. Nourishing, warming and deeply flavourful.",
    ingredients: "Whole wheat flour, edible gum (gond), ghee, jaggery, almonds, cashews, dry ginger, coconut.",
    allergens: ["Gluten (wheat)", "Tree nuts", "Milk (ghee)"], shelfLifeDays: 30, storage: DRY,
    art: { kind: "laddu", colors: ["#B7834E", "#93612F", "#F1DDB8"], bg: BG.gold },
    variants: kg(900, 50), flags: { newArrival: true }, tags: ["winter", "rajasthani"],
  },
  {
    name: "Coconut Laddu", nameHi: "नारियल लड्डू", slug: "coconut-laddu", category: "laddu",
    short: "Fresh coconut and condensed milk laddu with cardamom.",
    description: "Freshly grated coconut cooked with milk and sugar until fudgy, rolled in desiccated coconut. Soft, fragrant and delicately sweet.",
    ingredients: "Coconut, milk solids, sugar, cardamom, ghee.",
    allergens: ["Milk"], shelfLifeDays: 6, storage: DAIRY,
    art: { kind: "laddu", colors: ["#FBF7EF", "#EFE6D2", "#E9A0A8"], bg: BG.rose },
    variants: kg(520, 60), tags: ["coconut"],
  },
  // ── Barfi
  {
    name: "Kesar Pista Barfi", nameHi: "केसर पिस्ता बर्फी", slug: "kesar-pista-barfi", category: "barfi",
    short: "Layered saffron and pistachio khoya barfi.",
    description: "Two layers of slow-cooked khoya — one infused with Kashmiri saffron, the other with pistachio — set together and topped with pistachio slivers.",
    ingredients: "Khoya (milk solids), sugar, pistachio, saffron, cardamom, ghee.",
    allergens: ["Milk", "Pistachio"], shelfLifeDays: 7, storage: DAIRY,
    art: { kind: "barfi", colors: ["#F6CF6A", "#9CC163", "#5E8C31"], bg: BG.pista },
    variants: kg(760, 80, { discount: 0.1 }), flags: { bestseller: true }, tags: ["saffron", "pistachio"],
  },
  {
    name: "Chocolate Barfi", nameHi: "चॉकलेट बर्फी", slug: "chocolate-barfi", category: "barfi",
    short: "Classic milk barfi layered with rich Belgian cocoa.",
    description: "A modern favourite: creamy milk barfi layered with a dark Belgian-cocoa layer. Loved by kids and grown-ups alike.",
    ingredients: "Khoya, sugar, cocoa powder, dark chocolate, ghee.",
    allergens: ["Milk", "Soy (chocolate)"], shelfLifeDays: 7, storage: DAIRY,
    art: { kind: "barfi", colors: ["#F3E3C3", "#5B3220", "#3B1E12"], bg: BG.cocoa },
    variants: kg(680, 70), flags: { newArrival: true }, tags: ["chocolate", "kids"],
  },
  {
    name: "Badam Barfi", nameHi: "बादाम बर्फी", slug: "badam-barfi", category: "barfi",
    short: "California almond barfi finished with saffron.",
    description: "Blanched California almonds ground with milk solids and saffron, set into rich squares and finished with almond flakes.",
    ingredients: "Almonds (45%), milk solids, sugar, saffron, ghee, edible silver leaf.",
    allergens: ["Almond", "Milk"], shelfLifeDays: 12, storage: DRY,
    art: { kind: "barfi", colors: ["#F2D9A6", "#E8C27A", "#C7955A"], bg: BG.gold },
    variants: kg(1300, 40), tags: ["almond", "premium"],
  },
  {
    name: "Coconut Barfi", nameHi: "नारियल बर्फी", slug: "coconut-barfi", category: "barfi",
    short: "Two-tone rose and coconut barfi.",
    description: "Soft coconut barfi set in two layers — classic white and a delicate rose-pink — for a pretty, fragrant bite.",
    ingredients: "Coconut, milk solids, sugar, rose essence, cardamom.",
    allergens: ["Milk"], shelfLifeDays: 6, storage: DAIRY,
    art: { kind: "barfi", colors: ["#FBF6EE", "#F4B6C2", "#E07A8D"], bg: BG.rose },
    variants: kg(560, 60), tags: ["coconut", "rose"],
  },
  // ── Peda
  {
    name: "Mathura Peda", nameHi: "मथुरा पेड़ा", slug: "mathura-peda", category: "peda",
    short: "Caramelised khoya peda in the Braj tradition.",
    description: "Khoya roasted until deep caramel brown, rolled in bura sugar — the iconic peda of Mathura, offered at temples and loved at home.",
    ingredients: "Khoya, bura sugar, ghee, cardamom.",
    allergens: ["Milk"], shelfLifeDays: 10, storage: DRY,
    art: { kind: "peda", colors: ["#B98250", "#9A6536", "#F4E9D8"], bg: BG.cocoa },
    variants: kg(600, 90), flags: { bestseller: true }, tags: ["prasad", "temple"],
  },
  {
    name: "Kesar Peda", nameHi: "केसर पेड़ा", slug: "kesar-peda", category: "peda",
    short: "Saffron-infused peda stamped with pistachio.",
    description: "Fresh milk khoya infused with Kashmiri saffron and cardamom, pressed by hand and crowned with pistachio.",
    ingredients: "Khoya, sugar, saffron, cardamom, pistachio.",
    allergens: ["Milk", "Pistachio"], shelfLifeDays: 7, storage: DAIRY,
    art: { kind: "peda", colors: ["#F4C25A", "#E6A532", "#7FA34A"], bg: BG.saffron },
    variants: kg(720, 80), flags: { featured: true }, tags: ["saffron"],
  },
  {
    name: "Dharwad Peda", nameHi: "धारवाड़ पेड़ा", slug: "dharwad-peda", category: "peda",
    short: "Karnataka's famous slow-cooked brown peda.",
    description: "Milk simmered for hours with sugar until it turns grainy and caramelised — a GI-tagged speciality from Dharwad.",
    ingredients: "Milk, sugar, ghee, cardamom.",
    allergens: ["Milk"], shelfLifeDays: 10, storage: DRY,
    art: { kind: "peda", colors: ["#8F5A33", "#6F4224", "#E9D8BE"], bg: BG.cocoa },
    variants: kg(640, 50), tags: ["regional"],
  },
  // ── Rasgulla
  {
    name: "Classic Rasgulla", nameHi: "रसगुल्ला", slug: "classic-rasgulla", category: "rasgulla",
    short: "Spongy chhena balls in light sugar syrup.",
    shortHi: "हल्की चाशनी में स्पंजी छेना रसगुल्ले।",
    description: "Freshly made chhena kneaded until silky, shaped and cooked in bubbling syrup until perfectly spongy. Light, juicy and best served chilled.",
    ingredients: "Cow milk chhena, sugar, water, cardamom.",
    allergens: ["Milk"], shelfLifeDays: 5, storage: SYRUP,
    art: { kind: "syrupBalls", colors: ["#FBF8F1", "#EFE7D6", "#F6E7B9"], bg: BG.sky },
    variants: [
      { label: "500 g (8 pcs)", weightGrams: 500, mrp: 190, stock: 90 },
      { label: "1 kg (16 pcs)", weightGrams: 1000, mrp: 360, sale: 340, stock: 60 },
      { label: "2 kg tin (32 pcs)", weightGrams: 2000, mrp: 690, stock: 25 },
    ],
    flags: { bestseller: true }, tags: ["bengali", "chilled"],
  },
  {
    name: "Kesar Rasgulla", nameHi: "केसर रसगुल्ला", slug: "kesar-rasgulla", category: "rasgulla",
    short: "Saffron-kissed rasgulla in fragrant syrup.",
    description: "Our classic rasgulla soaked in saffron-infused syrup for a golden hue and gentle floral aroma.",
    ingredients: "Cow milk chhena, sugar, saffron, cardamom.",
    allergens: ["Milk"], shelfLifeDays: 5, storage: SYRUP,
    art: { kind: "syrupBalls", colors: ["#FCE9B8", "#F3CB6B", "#E68A1A"], bg: BG.saffron },
    variants: [
      { label: "500 g (8 pcs)", weightGrams: 500, mrp: 220, stock: 60 },
      { label: "1 kg (16 pcs)", weightGrams: 1000, mrp: 420, stock: 40 },
    ],
    tags: ["saffron", "chilled"],
  },
  // ── Bengali sweets
  {
    name: "Rasmalai", nameHi: "रसमलाई", slug: "rasmalai", category: "bengali-sweets",
    short: "Soft chhena discs soaked in saffron rabri.",
    description: "Flattened chhena dumplings simmered and soaked in thickened saffron-cardamom milk, garnished with pistachio and almond slivers. Served chilled.",
    ingredients: "Milk, chhena, sugar, saffron, pistachio, almonds, cardamom.",
    allergens: ["Milk", "Pistachio", "Almond"], shelfLifeDays: 3, storage: DAIRY,
    art: { kind: "rasmalai", colors: ["#FBF3DF", "#F4D58A", "#86A84F"], bg: BG.cream },
    variants: [
      { label: "4 pcs (400 g)", weightGrams: 400, mrp: 260, stock: 50 },
      { label: "8 pcs (800 g)", weightGrams: 800, mrp: 500, sale: 470, stock: 35 },
      { label: "16 pcs (1.6 kg)", weightGrams: 1600, mrp: 980, stock: 15 },
    ],
    flags: { bestseller: true, featured: true }, tags: ["chilled", "saffron"],
  },
  {
    name: "Nolen Gur Sandesh", nameHi: "नोलेन गुड़ संदेश", slug: "nolen-gur-sandesh", category: "bengali-sweets",
    short: "Delicate chhena sandesh with date-palm jaggery.",
    description: "Seasonal Bengali sandesh made with nolen gur (date-palm jaggery) for a smoky, caramel sweetness. Shaped in traditional moulds.",
    ingredients: "Chhena, nolen gur (date-palm jaggery), sugar, cardamom.",
    allergens: ["Milk"], shelfLifeDays: 3, storage: DAIRY,
    art: { kind: "sandesh", colors: ["#D8A766", "#B98243", "#F6E9CF"], bg: BG.gold },
    variants: kg(700, 40), flags: { newArrival: true }, tags: ["seasonal", "winter", "jaggery"],
  },
  {
    name: "Cham Cham", nameHi: "चम चम", slug: "cham-cham", category: "bengali-sweets",
    short: "Oval chhena sweets rolled in coconut and filled with malai.",
    description: "Elongated chhena sweets cooked in syrup, split and filled with sweetened malai, then rolled in desiccated coconut.",
    ingredients: "Chhena, sugar, malai, coconut, saffron.",
    allergens: ["Milk"], shelfLifeDays: 3, storage: DAIRY,
    art: { kind: "sandesh", colors: ["#F7C6CF", "#F1A2B2", "#FFFFFF"], bg: BG.rose },
    variants: kg(520, 45), tags: ["malai"],
  },
  {
    name: "Mishti Doi", nameHi: "मिष्टी दोई", slug: "mishti-doi", category: "bengali-sweets",
    short: "Caramelised sweet yogurt set in a clay pot.",
    description: "Milk reduced and caramelised with jaggery, then set overnight in traditional earthen pots that give it its signature texture.",
    ingredients: "Milk, sugar, jaggery, live cultures.",
    allergens: ["Milk"], shelfLifeDays: 4, storage: DAIRY,
    art: { kind: "pot", colors: ["#B5653A", "#F1D9AE", "#8E4A28"], bg: BG.cream },
    variants: [
      { label: "200 g pot", weightGrams: 200, mrp: 80, stock: 70 },
      { label: "400 g pot", weightGrams: 400, mrp: 150, stock: 50 },
      { label: "1 kg handi", weightGrams: 1000, mrp: 340, stock: 20 },
    ],
    tags: ["chilled", "probiotic"],
  },
  // ── Gulab jamun
  {
    name: "Gulab Jamun", nameHi: "गुलाब जामुन", slug: "gulab-jamun", category: "gulab-jamun",
    short: "Khoya dumplings in rose-cardamom syrup.",
    shortHi: "गुलाब-इलायची चाशनी में खोया के जामुन।",
    description: "Soft khoya dumplings fried slowly in ghee until evenly golden, then soaked in rose and cardamom syrup. Warm them for 20 seconds for the full experience.",
    ingredients: "Khoya, refined flour, sugar, ghee, rose water, cardamom.",
    allergens: ["Milk", "Gluten (wheat)"], shelfLifeDays: 6, storage: SYRUP,
    art: { kind: "syrupBalls", colors: ["#8E3B1B", "#6D2A12", "#F3C66E"], bg: BG.maroon },
    variants: [
      { label: "500 g (10 pcs)", weightGrams: 500, mrp: 200, stock: 100 },
      { label: "1 kg (20 pcs)", weightGrams: 1000, mrp: 400, sale: 370, stock: 70 },
      { label: "2 kg tin (40 pcs)", weightGrams: 2000, mrp: 780, stock: 20 },
    ],
    flags: { bestseller: true, featured: true }, tags: ["warm", "classic"],
  },
  {
    name: "Kala Jamun", nameHi: "काला जामुन", slug: "kala-jamun", category: "gulab-jamun",
    short: "Deep-fried dark jamun with a caramelised crust.",
    description: "Fried longer for a dark, caramelised exterior and a soft, juicy centre stuffed with cardamom and pistachio.",
    ingredients: "Khoya, chhena, sugar, ghee, pistachio, cardamom.",
    allergens: ["Milk", "Pistachio", "Gluten (wheat)"], shelfLifeDays: 6, storage: SYRUP,
    art: { kind: "syrupBalls", colors: ["#3C1A10", "#24100A", "#E4B860"], bg: BG.cocoa },
    variants: [
      { label: "500 g (10 pcs)", weightGrams: 500, mrp: 220, stock: 60 },
      { label: "1 kg (20 pcs)", weightGrams: 1000, mrp: 440, stock: 40 },
    ],
    tags: ["classic"],
  },
  {
    name: "Mini Gulab Jamun", nameHi: "मिनी गुलाब जामुन", slug: "mini-gulab-jamun", category: "gulab-jamun",
    short: "Bite-sized jamuns, perfect for parties.",
    description: "Little jamuns, big flavour. Ideal for parties and dessert platters — pop them straight from the box.",
    ingredients: "Khoya, refined flour, sugar, ghee, rose water.",
    allergens: ["Milk", "Gluten (wheat)"], shelfLifeDays: 6, storage: SYRUP,
    art: { kind: "syrupBalls", colors: ["#A2471F", "#7A3415", "#F6D38A"], bg: BG.saffron },
    variants: kg(420, 50, { sizes: [500, 1000] }), tags: ["party"],
  },
  // ── Milk sweets
  {
    name: "Kalakand", nameHi: "कलाकंद", slug: "kalakand", category: "milk-sweets",
    short: "Moist, grainy milk cake with pistachio.",
    description: "Fresh chhena and reduced milk cooked together for a soft, moist and grainy texture. Topped with pistachio and a hint of rose.",
    ingredients: "Milk, chhena, sugar, pistachio, cardamom.",
    allergens: ["Milk", "Pistachio"], shelfLifeDays: 4, storage: DAIRY,
    art: { kind: "barfi", colors: ["#FBF4E4", "#F1E2C2", "#86A84F"], bg: BG.cream },
    variants: kg(680, 60), flags: { bestseller: true }, tags: ["fresh"],
  },
  {
    name: "Alwar Milk Cake", nameHi: "अलवर मिल्क केक", slug: "alwar-milk-cake", category: "milk-sweets",
    short: "Caramelised milk cake from Alwar, Rajasthan.",
    description: "Milk reduced for hours until it caramelises at the centre — creating the signature brown core and creamy edges of Alwar's famous milk cake.",
    ingredients: "Milk, sugar, ghee, alum (trace).",
    allergens: ["Milk"], shelfLifeDays: 10, storage: DRY,
    art: { kind: "barfi", colors: ["#E9C99A", "#B07A44", "#7C4D26"], bg: BG.gold },
    variants: kg(640, 70), flags: { featured: true }, tags: ["rajasthani"],
  },
  {
    name: "Rabri", nameHi: "रबड़ी", slug: "rabri", category: "milk-sweets",
    short: "Slow-reduced layered milk with saffron and nuts.",
    description: "Full-cream milk simmered for hours, the malai layers collected and folded back in with saffron, cardamom and nuts.",
    ingredients: "Full-cream milk, sugar, saffron, almonds, pistachio, cardamom.",
    allergens: ["Milk", "Tree nuts"], shelfLifeDays: 2, storage: DAIRY,
    art: { kind: "bowl", colors: ["#FBF0D5", "#F2D99A", "#86A84F"], bg: BG.cream },
    variants: kg(560, 40, { sizes: [250, 500, 1000] }), tags: ["chilled"],
  },
  // ── Indian sweets
  {
    name: "Jalebi", nameHi: "जलेबी", slug: "jalebi", category: "indian-sweets",
    short: "Crisp saffron spirals soaked in syrup — fried to order.",
    shortHi: "ऑर्डर पर तली हुई कुरकुरी केसरिया जलेबी।",
    description: "Fermented batter piped into spirals, fried crisp in ghee and dunked in saffron syrup. Fried fresh when you order and best enjoyed warm.",
    ingredients: "Refined flour, curd, sugar, ghee, saffron.",
    allergens: ["Gluten (wheat)", "Milk"], shelfLifeDays: 1, storage: FRESH,
    art: { kind: "jalebi", colors: ["#F59A14", "#E0740B", "#FFD27A"], bg: BG.saffron },
    variants: kg(360, 60, { sizes: [250, 500, 1000] }), flags: { bestseller: true }, tags: ["fresh", "warm", "breakfast"],
  },
  {
    name: "Soan Papdi", nameHi: "सोन पापड़ी", slug: "soan-papdi", category: "indian-sweets",
    short: "Flaky, melt-in-mouth cubes with pistachio.",
    description: "Gram flour and sugar pulled into hundreds of delicate threads, layered into flaky cubes and topped with pistachio. Long shelf life — great for gifting.",
    ingredients: "Gram flour, sugar, ghee, refined flour, pistachio, cardamom.",
    allergens: ["Gluten (wheat)", "Milk", "Pistachio"], shelfLifeDays: 90, storage: DRY,
    art: { kind: "cubes", colors: ["#F2D89A", "#E5C277", "#86A84F"], bg: BG.gold },
    variants: kg(360, 120, { sizes: [250, 500, 1000] }), tags: ["gifting", "long shelf life"],
  },
  {
    name: "Mysore Pak", nameHi: "मैसूर पाक", slug: "mysore-pak", category: "indian-sweets",
    short: "Ghee-rich gram flour fudge from Mysuru.",
    description: "Gram flour cooked in generous amounts of ghee until porous and melt-in-mouth — the royal sweet of Mysuru.",
    ingredients: "Gram flour, pure ghee, sugar.",
    allergens: ["Milk (ghee)"], shelfLifeDays: 20, storage: DRY,
    art: { kind: "cubes", colors: ["#F4B93E", "#DE9A20", "#FBE3A0"], bg: BG.saffron },
    variants: kg(720, 60), tags: ["ghee", "south indian"],
  },
  {
    name: "Malai Ghevar", nameHi: "मलाई घेवर", slug: "malai-ghevar", category: "indian-sweets",
    short: "Honeycomb ghevar topped with malai and nuts.",
    description: "The Rajasthani honeycomb disc fried in ghee, soaked in syrup and crowned with rabri malai, saffron and pistachio.",
    ingredients: "Refined flour, ghee, milk, sugar, malai, saffron, pistachio, almonds.",
    allergens: ["Gluten (wheat)", "Milk", "Tree nuts"], shelfLifeDays: 3, storage: DAIRY,
    art: { kind: "ghevar", colors: ["#F2C46B", "#FBF0D3", "#86A84F"], bg: BG.gold },
    variants: [
      { label: "1 pc (250 g)", weightGrams: 250, mrp: 180, stock: 40 },
      { label: "2 pcs (500 g)", weightGrams: 500, mrp: 340, stock: 30 },
    ],
    flags: { newArrival: true }, tags: ["rajasthani", "teej"],
  },
  {
    name: "Balushahi", nameHi: "बालूशाही", slug: "balushahi", category: "indian-sweets",
    short: "Flaky glazed doughnuts fried in ghee.",
    description: "Layered dough fried slowly in ghee and glazed with sugar syrup — crisp outside, flaky within.",
    ingredients: "Refined flour, ghee, curd, sugar.",
    allergens: ["Gluten (wheat)", "Milk"], shelfLifeDays: 10, storage: DRY,
    art: { kind: "peda", colors: ["#E7B263", "#C98D3D", "#FFF5DD"], bg: BG.saffron },
    variants: kg(480, 50), tags: ["ghee"],
  },
  {
    name: "Til Gajak", nameHi: "तिल गजक", slug: "til-gajak", category: "indian-sweets",
    short: "Crunchy sesame and jaggery brittle from Morena.",
    description: "Sesame and jaggery pounded thin and layered into crisp, melt-away gajak. A winter favourite best enjoyed in the sun.",
    ingredients: "Sesame seeds, jaggery, ghee.",
    allergens: ["Sesame", "Milk (ghee)"], shelfLifeDays: 60, storage: DRY,
    art: { kind: "cubes", colors: ["#C58E4E", "#A06B33", "#F6EAD2"], bg: BG.cocoa },
    variants: kg(600, 70, { sizes: [250, 500, 1000] }), flags: { newArrival: true }, tags: ["winter", "sankranti", "jaggery"],
  },
  {
    name: "Punjabi Pinni", nameHi: "पंजाबी पिन्नी", slug: "punjabi-pinni", category: "indian-sweets",
    short: "Whole-wheat and ghee pinni loaded with dry fruits.",
    description: "Roasted whole wheat, khoya, desi ghee and loads of dry fruits — the hearty Punjabi winter sweet.",
    ingredients: "Whole wheat flour, ghee, khoya, sugar, almonds, cashews, raisins, edible gum.",
    allergens: ["Gluten (wheat)", "Milk", "Tree nuts"], shelfLifeDays: 25, storage: DRY,
    art: { kind: "laddu", colors: ["#A87443", "#86562C", "#E9D1A6"], bg: BG.cocoa },
    variants: kg(800, 40), tags: ["winter", "punjabi"],
  },
  // ── Dry fruits
  {
    name: "Royal Mixed Dry Fruits", nameHi: "रॉयल मिक्स ड्राई फ्रूट्स", slug: "royal-mixed-dry-fruits", category: "dry-fruits",
    short: "Almonds, cashews, pistachios, raisins and apricots.",
    description: "A premium hand-sorted mix of California almonds, W240 cashews, roasted pistachios, Afghan raisins and Turkish apricots.",
    ingredients: "Almonds, cashews, pistachios, raisins, apricots.",
    allergens: ["Tree nuts"], shelfLifeDays: 180, storage: DRY,
    art: { kind: "dryfruits", colors: ["#C68B4E", "#EFD8B0", "#8DB255"], bg: BG.gold },
    variants: kg(1600, 60), flags: { featured: true }, tags: ["gifting", "healthy"],
  },
  {
    name: "Roasted Salted Cashews", nameHi: "भुने नमकीन काजू", slug: "roasted-salted-cashews", category: "dry-fruits",
    short: "Jumbo W240 cashews roasted with Himalayan salt.",
    description: "Whole jumbo cashews slow-roasted without oil and lightly seasoned with pink Himalayan salt.",
    ingredients: "Cashew nuts, Himalayan pink salt.",
    allergens: ["Cashew"], shelfLifeDays: 120, storage: DRY,
    art: { kind: "dryfruits", colors: ["#EBCB98", "#D7AE6E", "#EBCB98"], bg: BG.cream },
    variants: kg(1400, 60), tags: ["snack"],
  },
  {
    name: "California Almonds", nameHi: "कैलिफ़ोर्निया बादाम", slug: "california-almonds", category: "dry-fruits",
    short: "Crunchy, premium-grade whole almonds.",
    description: "Non-pareil California almonds — crunchy, sweet and perfect for soaking overnight.",
    ingredients: "Almonds.",
    allergens: ["Almond"], shelfLifeDays: 240, storage: DRY,
    art: { kind: "dryfruits", colors: ["#B0703C", "#8F5528", "#B0703C"], bg: BG.cocoa },
    variants: kg(1100, 70), tags: ["healthy"],
  },
  // ── Namkeen
  {
    name: "Bikaneri Aloo Bhujia", nameHi: "बीकानेरी आलू भुजिया", slug: "bikaneri-aloo-bhujia", category: "namkeen",
    short: "Fine, spicy potato sev in the Bikaner style.",
    description: "Potato and moth-bean flour sev spiced with black pepper and dry mango — crunchy, tangy and addictive.",
    ingredients: "Potato, moth bean flour, gram flour, vegetable oil, spices, salt.",
    allergens: [], shelfLifeDays: 90, storage: DRY, gstRate: 12,
    art: { kind: "namkeen", colors: ["#E2A93C", "#C98722", "#7A9A3A"], bg: BG.saffron },
    variants: kg(280, 150, { sizes: [200, 400, 1000] }), flags: { bestseller: true }, tags: ["spicy", "tea-time"],
  },
  {
    name: "Navratan Mixture", nameHi: "नवरत्न मिक्सचर", slug: "navratan-mixture", category: "namkeen",
    short: "Nine-ingredient crunchy mix with nuts and raisins.",
    description: "A festive blend of sev, boondi, peanuts, cashews, raisins, cornflakes and curry leaves — sweet, salty and spicy.",
    ingredients: "Gram flour, peanuts, cashews, raisins, cornflakes, vegetable oil, curry leaves, spices.",
    allergens: ["Peanut", "Cashew"], shelfLifeDays: 75, storage: DRY, gstRate: 12,
    art: { kind: "namkeen", colors: ["#E8B54C", "#B8452D", "#6F8F35"], bg: BG.gold },
    variants: kg(300, 100, { sizes: [200, 400, 1000] }), tags: ["tea-time"],
  },
  {
    name: "Khatta Meetha", nameHi: "खट्टा मीठा", slug: "khatta-meetha", category: "namkeen",
    short: "Sweet-and-sour mix with a tangy kick.",
    description: "Crunchy sev, peas and lentils tossed with sugar crystals and tangy spices — the perfect balance of sweet and sour.",
    ingredients: "Gram flour, green peas, lentils, sugar, vegetable oil, spices.",
    allergens: [], shelfLifeDays: 75, storage: DRY, gstRate: 12,
    art: { kind: "namkeen", colors: ["#F0C25A", "#8DB255", "#D9762A"], bg: BG.pista },
    variants: kg(280, 90, { sizes: [200, 400, 1000] }), tags: ["kids"],
  },
  {
    name: "Moong Dal Namkeen", nameHi: "मूंग दाल नमकीन", slug: "moong-dal-namkeen", category: "namkeen",
    short: "Crispy salted moong dal — light and protein-rich.",
    description: "Split moong dal fried crisp and lightly salted. A light, protein-rich crunch.",
    ingredients: "Moong dal, vegetable oil, salt.",
    allergens: [], shelfLifeDays: 90, storage: DRY, gstRate: 12,
    art: { kind: "namkeen", colors: ["#E9CF6B", "#D2B54E", "#E9CF6B"], bg: BG.gold },
    variants: kg(320, 90, { sizes: [200, 400, 1000] }), tags: ["protein"],
  },
  // ── Snacks
  {
    name: "Punjabi Samosa", nameHi: "पंजाबी समोसा", slug: "punjabi-samosa", category: "snacks",
    short: "Flaky samosas with spiced potato and peas — fried fresh.",
    description: "Hand-folded crisp pastry filled with spiced potatoes, green peas and whole spices. Served with mint and tamarind chutneys.",
    ingredients: "Refined flour, potato, peas, vegetable oil, spices, chutneys.",
    allergens: ["Gluten (wheat)"], shelfLifeDays: 1, storage: FRESH,
    art: { kind: "triangles", colors: ["#E4A548", "#C9862C", "#5E8C31"], bg: BG.saffron },
    variants: [
      { label: "Pack of 4", mrp: 90, stock: 80 },
      { label: "Pack of 8", mrp: 170, stock: 50 },
    ],
    flags: { bestseller: true }, tags: ["fresh", "hot"],
  },
  {
    name: "Pyaaz Kachori", nameHi: "प्याज़ कचौरी", slug: "pyaaz-kachori", category: "snacks",
    short: "Jodhpur-style onion kachori, crisp and spicy.",
    description: "Flaky kachoris stuffed with a spiced onion filling, fried slow for maximum crunch. A Rajasthani breakfast staple.",
    ingredients: "Refined flour, onion, gram flour, vegetable oil, spices.",
    allergens: ["Gluten (wheat)"], shelfLifeDays: 1, storage: FRESH,
    art: { kind: "rounds", colors: ["#D99A45", "#B87728", "#F1D7A6"], bg: BG.gold },
    variants: [
      { label: "Pack of 4", mrp: 110, stock: 60 },
      { label: "Pack of 8", mrp: 210, stock: 40 },
    ],
    tags: ["fresh", "rajasthani"],
  },
  {
    name: "Ajwain Mathri", nameHi: "अजवाइन मठरी", slug: "ajwain-mathri", category: "snacks",
    short: "Flaky carom-seed crackers for chai time.",
    description: "Layered, flaky crackers seasoned with carom seeds and crushed pepper. Pairs beautifully with masala chai.",
    ingredients: "Refined flour, ghee, carom seeds, black pepper, salt.",
    allergens: ["Gluten (wheat)", "Milk"], shelfLifeDays: 45, storage: DRY,
    art: { kind: "rounds", colors: ["#EBCB8A", "#D3AB62", "#7B5A35"], bg: BG.cream },
    variants: kg(360, 80, { sizes: [250, 500] }), tags: ["tea-time"],
  },
  {
    name: "Khaman Dhokla", nameHi: "खमण ढोकला", slug: "khaman-dhokla", category: "snacks",
    short: "Spongy Gujarati dhokla with mustard tempering.",
    description: "Steamed gram-flour sponge tempered with mustard seeds, curry leaves and green chillies. Light, tangy and freshly steamed.",
    ingredients: "Gram flour, curd, sugar, mustard seeds, curry leaves, green chillies, coriander.",
    allergens: ["Milk", "Mustard"], shelfLifeDays: 1, storage: FRESH,
    art: { kind: "dhokla", colors: ["#F4D35E", "#E7BD3E", "#3E7D32"], bg: BG.pista },
    variants: kg(320, 40, { sizes: [500, 1000] }), flags: { newArrival: true }, tags: ["fresh", "steamed"],
  },
  // ── Cakes
  {
    name: "Rasmalai Fusion Cake", nameHi: "रसमलाई फ्यूज़न केक", slug: "rasmalai-fusion-cake", category: "cakes",
    short: "Saffron sponge soaked in rasmalai milk with malai cream.",
    description: "Eggless saffron sponge soaked in rasmalai milk, layered with whipped malai cream and real rasmalai pieces, finished with pistachio.",
    ingredients: "Refined flour, milk, sugar, cream, chhena, saffron, pistachio, cardamom.",
    allergens: ["Gluten (wheat)", "Milk", "Pistachio"], shelfLifeDays: 2, storage: DAIRY, gstRate: 18,
    art: { kind: "cake", colors: ["#FBEFD3", "#F3C969", "#86A84F"], bg: BG.cream },
    variants: [
      { label: "500 g", weightGrams: 500, mrp: 650, stock: 15 },
      { label: "1 kg", weightGrams: 1000, mrp: 1250, sale: 1150, stock: 10 },
    ],
    flags: { featured: true, newArrival: true }, tags: ["eggless", "birthday", "fusion"],
  },
  {
    name: "Eggless Chocolate Truffle", nameHi: "एगलेस चॉकलेट ट्रफल", slug: "eggless-chocolate-truffle", category: "cakes",
    short: "Dense, glossy Belgian chocolate truffle cake.",
    description: "Moist eggless chocolate sponge layered with Belgian chocolate ganache and finished with a mirror glaze.",
    ingredients: "Refined flour, dark chocolate, cream, sugar, cocoa, milk, butter.",
    allergens: ["Gluten (wheat)", "Milk", "Soy"], shelfLifeDays: 3, storage: DAIRY, gstRate: 18,
    art: { kind: "cake", colors: ["#5B2E1C", "#3A1B10", "#E8B04C"], bg: BG.cocoa },
    variants: [
      { label: "500 g", weightGrams: 500, mrp: 600, stock: 15 },
      { label: "1 kg", weightGrams: 1000, mrp: 1150, stock: 10 },
    ],
    tags: ["eggless", "birthday", "chocolate"],
  },
  {
    name: "Gulab Jamun Cheesecake", nameHi: "गुलाब जामुन चीज़केक", slug: "gulab-jamun-cheesecake", category: "cakes",
    short: "Baked cheesecake studded with mini gulab jamuns.",
    description: "Creamy eggless baked cheesecake on a cardamom biscuit base, studded with mini gulab jamuns and a rose-syrup drizzle.",
    ingredients: "Cream cheese, khoya, refined flour, sugar, butter, cardamom, rose water.",
    allergens: ["Gluten (wheat)", "Milk"], shelfLifeDays: 3, storage: DAIRY, gstRate: 18,
    art: { kind: "cake", colors: ["#FBF3E6", "#8E3B1B", "#E98DA0"], bg: BG.rose },
    variants: [{ label: "500 g", weightGrams: 500, mrp: 720, stock: 12 }, { label: "1 kg", weightGrams: 1000, mrp: 1390, stock: 6 }],
    flags: { newArrival: true }, tags: ["eggless", "fusion"],
  },
  // ── Gift hampers
  {
    name: "Royal Celebration Hamper", nameHi: "रॉयल सेलिब्रेशन हैम्पर", slug: "royal-celebration-hamper", category: "gift-hampers",
    short: "Kaju katli, dry fruits and pedas in a handcrafted keepsake box.",
    shortHi: "काजू कतली, मेवे और पेड़े — हस्तनिर्मित उपहार बॉक्स में।",
    description: "Our most-gifted hamper: Kaju Katli, Kesar Peda, Royal Mixed Dry Fruits and a jar of Soan Papdi, presented in a maroon and gold keepsake box with a personalised greeting card.",
    ingredients: "Assorted sweets and dry fruits — see individual product details.",
    allergens: ["Tree nuts", "Milk", "Gluten (wheat)"], shelfLifeDays: 10, storage: DRY,
    art: { kind: "hamper", colors: ["#8F1D34", "#D4A72C", "#F7E7C1"], bg: BG.maroon },
    variants: [
      { label: "Classic", mrp: 1499, stock: 40 },
      { label: "Premium", mrp: 2499, sale: 2299, stock: 25 },
      { label: "Grand", mrp: 3999, stock: 10 },
    ],
    flags: { featured: true, bestseller: true }, tags: ["wedding", "corporate", "diwali", "gifting"],
  },
  {
    name: "Dry Fruit Treasure Box", nameHi: "ड्राई फ्रूट ट्रेज़र बॉक्स", slug: "dry-fruit-treasure-box", category: "gift-hampers",
    short: "Four premium dry fruits in a velvet-lined box.",
    description: "Almonds, cashews, pistachios and Afghan raisins in a velvet-lined wooden box. An elegant gift for every occasion.",
    ingredients: "Almonds, cashews, pistachios, raisins.",
    allergens: ["Tree nuts"], shelfLifeDays: 180, storage: DRY,
    art: { kind: "hamper", colors: ["#5A2E1A", "#D4A72C", "#C68B4E"], bg: BG.gold },
    variants: [{ label: "400 g", weightGrams: 400, mrp: 1299, stock: 30 }, { label: "800 g", weightGrams: 800, mrp: 2199, stock: 20 }],
    tags: ["corporate", "healthy", "gifting"],
  },
  {
    name: "Mithai Assortment Box", nameHi: "मिठाई असॉर्टमेंट बॉक्स", slug: "mithai-assortment-box", category: "gift-hampers",
    short: "Chef's selection of eight signature sweets.",
    description: "A beautiful box of eight of our signature sweets — kaju katli, kesar pista barfi, mathura peda, motichoor laddu, badam barfi, mysore pak, kaju pista roll and milk cake.",
    ingredients: "Assorted sweets — see individual product details.",
    allergens: ["Tree nuts", "Milk", "Gluten (wheat)"], shelfLifeDays: 7, storage: DRY,
    art: { kind: "hamper", colors: ["#B22A42", "#F2C46B", "#FFF3DA"], bg: BG.saffron },
    variants: [{ label: "500 g", weightGrams: 500, mrp: 549, stock: 50 }, { label: "1 kg", weightGrams: 1000, mrp: 1049, stock: 35 }],
    flags: { bestseller: true }, tags: ["gifting", "assorted"],
  },
  {
    name: "Wedding Shagun Box", nameHi: "शादी शगुन बॉक्स", slug: "wedding-shagun-box", category: "gift-hampers",
    short: "Elegant return-gift boxes for weddings and functions.",
    description: "Compact shagun boxes with kaju katli, dry fruit laddu and almonds — customisable with names and dates for weddings and family functions.",
    ingredients: "Kaju katli, dry fruit laddu, almonds.",
    allergens: ["Tree nuts", "Milk"], shelfLifeDays: 12, storage: DRY,
    art: { kind: "hamper", colors: ["#C0392B", "#E9B949", "#FFF1D6"], bg: BG.rose },
    variants: [{ label: "Box of 1", mrp: 399, stock: 100 }, { label: "Box of 10", mrp: 3990, sale: 3590, stock: 20 }, { label: "Box of 25", mrp: 9975, sale: 8490, stock: 8 }],
    flags: { newArrival: true }, tags: ["wedding", "return gift", "bulk"],
  },
  // ── Special combos
  {
    name: "Pooja Prasad Combo", nameHi: "पूजा प्रसाद कॉम्बो", slug: "pooja-prasad-combo", category: "special-combos",
    short: "Boondi laddu, Mathura peda and dry fruits for pooja.",
    description: "Everything you need for prasad: 500 g Boondi Laddu, 250 g Mathura Peda and 100 g mixed dry fruits — at a special combo price.",
    ingredients: "Boondi laddu, mathura peda, mixed dry fruits.",
    allergens: ["Milk", "Tree nuts"], shelfLifeDays: 7, storage: DRY,
    art: { kind: "combo", colors: ["#F2A516", "#B98250", "#8F1D34"], bg: BG.saffron },
    variants: [{ label: "Combo", mrp: 699, sale: 599, stock: 40 }], tags: ["pooja", "value"],
  },
  {
    name: "Chai-Time Combo", nameHi: "चाय टाइम कॉम्बो", slug: "chai-time-combo", category: "special-combos",
    short: "Aloo bhujia, mathri and soan papdi for evening chai.",
    description: "400 g Bikaneri Aloo Bhujia, 250 g Ajwain Mathri and 250 g Soan Papdi — the perfect companions for your evening chai.",
    ingredients: "Aloo bhujia, ajwain mathri, soan papdi.",
    allergens: ["Gluten (wheat)", "Milk", "Pistachio"], shelfLifeDays: 45, storage: DRY,
    art: { kind: "combo", colors: ["#E2A93C", "#EBCB8A", "#B22A42"], bg: BG.gold },
    variants: [{ label: "Combo", mrp: 549, sale: 479, stock: 50 }], flags: { featured: true }, tags: ["tea-time", "value"],
  },
  {
    name: "Family Feast Combo", nameHi: "फैमिली फीस्ट कॉम्बो", slug: "family-feast-combo", category: "special-combos",
    short: "Gulab jamun, rasgulla, kaju katli and namkeen for the whole family.",
    description: "1 kg Gulab Jamun, 1 kg Rasgulla, 250 g Kaju Katli and 400 g Navratan Mixture — a feast for family get-togethers.",
    ingredients: "Gulab jamun, rasgulla, kaju katli, navratan mixture.",
    allergens: ["Milk", "Gluten (wheat)", "Tree nuts", "Peanut"], shelfLifeDays: 5, storage: SYRUP,
    art: { kind: "combo", colors: ["#8E3B1B", "#FBF8F1", "#EFE6D6"], bg: BG.maroon },
    variants: [{ label: "Combo", mrp: 1349, sale: 1199, stock: 25 }], flags: { bestseller: true }, tags: ["party", "value"],
  },
];

export const COLLECTIONS = [
  {
    slug: "winter-specials",
    name: "Winter Specials — Til, Gud & Ghee",
    nameHi: "सर्दियों की ख़ास मिठाइयाँ",
    description: "Warming winter sweets made with sesame, jaggery and pure ghee — just in time for Makar Sankranti and Lohri.",
    theme: "saffron",
    isFestival: true,
    products: ["til-gud-laddu", "gond-laddu", "til-gajak", "punjabi-pinni", "nolen-gur-sandesh", "dry-fruit-laddu"],
  },
  {
    slug: "wedding-season",
    name: "Wedding Season Gifting",
    nameHi: "शादी के मौसम के उपहार",
    description: "Shagun boxes, royal hampers and celebration sweets for the season of weddings.",
    theme: "maroon",
    isFestival: true,
    products: ["wedding-shagun-box", "royal-celebration-hamper", "kaju-katli", "motichoor-laddu", "mithai-assortment-box", "dry-fruit-treasure-box"],
  },
];
