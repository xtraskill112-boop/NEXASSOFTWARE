import { describe, expect, it } from "vitest";
import { client } from "./helpers";

describe("catalog & search", () => {
  it("lists products with variants and prices in paise", async () => {
    const c = await client();
    const r = await c.get("/api/v1/catalog/products?pageSize=5");
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(5);
    const p = r.body.items[0];
    expect(p.variants.length).toBeGreaterThan(0);
    expect(typeof p.variants[0].pricePaise).toBe("number");
    expect(r.body.meta.total).toBeGreaterThan(40);
  });

  it("is typo tolerant", async () => {
    const c = await client();
    for (const [q, expected] of [["kaju katri", "Kaju Katli"], ["gulab jamon", "Gulab Jamun"], ["motichur", "Motichoor Laddu"]] as const) {
      const r = await c.get(`/api/v1/catalog/products?q=${encodeURIComponent(q)}`);
      expect(r.body.items.map((i: { name: string }) => i.name)).toContain(expected);
    }
  });

  it("searches by ingredient and category", async () => {
    const c = await client();
    const sesame = await c.get("/api/v1/catalog/products?q=sesame");
    expect(sesame.body.items.some((i: { slug: string }) => i.slug === "til-gajak")).toBe(true);
    const bengali = await c.get("/api/v1/catalog/products?q=bengali");
    expect(bengali.body.items.length).toBeGreaterThan(2);
  });

  it("filters by category, price range and offers, and sorts by price", async () => {
    const c = await client();
    const r = await c.get("/api/v1/catalog/products?category=laddu&sort=price_asc&pageSize=50");
    const prices = r.body.items.map((i: { minPricePaise: number }) => i.minPricePaise);
    expect(r.body.items.every((i: { category: { slug: string } }) => i.category.slug === "laddu")).toBe(true);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const cheap = await c.get("/api/v1/catalog/products?maxPrice=10000&pageSize=50");
    expect(cheap.body.items.every((i: { variants: { pricePaise: number }[] }) => i.variants.some((v) => v.pricePaise <= 10000))).toBe(true);
    const offers = await c.get("/api/v1/catalog/products?onOffer=true&pageSize=50");
    expect(offers.body.items.every((i: { maxDiscountPct: number }) => i.maxDiscountPct > 0)).toBe(true);
  });

  it("returns suggestions and trending searches", async () => {
    const c = await client();
    const s = await c.get("/api/v1/catalog/search/suggest?q=laddu");
    expect(s.body.products.length).toBeGreaterThan(0);
    const t = await c.get("/api/v1/catalog/search/trending");
    expect(t.body.terms.length).toBeGreaterThan(0);
  });

  it("returns product detail with variant-level price and stock", async () => {
    const c = await client();
    const r = await c.get("/api/v1/catalog/products/kaju-katli");
    expect(r.status).toBe(200);
    const p = r.body.product;
    expect(p.variants.map((v: { label: string }) => v.label)).toEqual(["250 g", "500 g", "1 kg", "2 kg"]);
    const prices = p.variants.map((v: { pricePaise: number }) => v.pricePaise);
    expect(prices[1]).toBeGreaterThan(prices[0]);
    expect(p.ingredients).toContain("Cashew");
    expect(p.allergens.length).toBeGreaterThan(0);
    expect(p.related.length).toBeGreaterThan(0);
  });

  it("serves the configurable home feed", async () => {
    const c = await client();
    const r = await c.get("/api/v1/catalog/home");
    expect(r.body.banners.hero.length).toBeGreaterThan(0);
    expect(r.body.sections.find((s: { type: string }) => s.type === "BESTSELLERS").products.length).toBeGreaterThan(0);
  });

  it("estimates delivery for serviceable pincodes only", async () => {
    const c = await client();
    const ok = await c.get("/api/v1/catalog/delivery-estimate?pincode=302001");
    expect(ok.body.serviceable).toBe(true);
    expect(ok.body.etaMinutes).toBeGreaterThan(0);
    const no = await c.get("/api/v1/catalog/delivery-estimate?pincode=110001");
    expect(no.body.serviceable).toBe(false);
  });
});
