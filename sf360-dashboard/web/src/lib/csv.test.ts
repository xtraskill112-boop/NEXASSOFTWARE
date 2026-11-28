import { describe, expect, it } from "vitest";
import { buildBulkOrders, missingColumns, normalizeHeader, rowsFromTable, templateCsv, toCsv } from "./csv";
import { normalizeSearch } from "./format";
import type { SavedAddress } from "../types";

const pickup: SavedAddress = { id: "a1", label: "WH", name: "Store", contact: "9876543211", address1: "15 Industrial Area", city: "Bengaluru", pincode: 560058 };

describe("bulk upload", () => {
  it("reads the template back", () => {
    const table = templateCsv()
      .trim()
      .split("\n")
      .map((l) => l.split(","));
    const rows = rowsFromTable(table);
    expect(rows).toHaveLength(1);
    expect(missingColumns(rows)).toEqual([]);
    const orders = buildBulkOrders(rows, { orderType: "marketplace", returnType: "seller", pickup, returnAddress: pickup });
    expect(orders[0].payload).toMatchObject({
      clientOrderId: "ORD-1001",
      paymentMode: "cod",
      codAmount: "1299",
      customer: { name: "Rahul Sharma", pincode: "560034" },
      pickup: { pincode: 560058, contact: "9876543211" },
      products: [{ name: "Wireless Headphones", skuId: "SKU-HP-01", price: "1299" }],
    });
    expect(orders[0].lines).toEqual([2]);
  });

  it("groups rows with the same order id into one order with several products", () => {
    const rows = rowsFromTable([
      ["Client Order ID*", "Customer Name", "customer_phone", "address_line_1", "city", "pincode", "payment_mode", "product_value", "sku_name", "sku_id", "quantity"],
      ["A1", "Asha", "9999999999", "x", "Delhi", "110001", "Prepaid", "1000", "Shirt", "S1", "2"],
      ["A1", "", "", "", "", "", "", "", "Cap", "C1", "1"],
      ["", "", "", "", "", "", "", "", "", "", ""],
      ["B2", "Ravi", "8888888888", "y", "Pune", "411001", "cod", "500", "Mug", "M1", ""],
    ]);
    expect(rows).toHaveLength(3);
    const orders = buildBulkOrders(rows, { orderType: "warehouse", returnType: "seller", pickup, returnAddress: pickup });
    expect(orders).toHaveLength(2);
    expect(orders[0].lines).toEqual([2, 3]);
    expect(orders[0].payload.products).toHaveLength(2);
    expect(orders[0].payload.products[0].price).toBe("500");
    expect(orders[0].payload.returnType).toBe("origin");
    expect(orders[1].payload.paymentMode).toBe("cod");
    expect(orders[1].payload.codAmount).toBe("");
  });

  it("normalises headers", () => {
    expect(normalizeHeader(" Customer Phone* ")).toBe("customer_phone");
  });
});

describe("csv export", () => {
  it("escapes quotes, commas and formula prefixes", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", "+91", 5]])).toBe('"a,b","say ""hi""",\'=SUM(A1),\'+91,5');
  });
});

describe("search", () => {
  it("matches the server's token rules", () => {
    expect(normalizeSearch("+91 98765 43210")).toBe("9876543210");
    expect(normalizeSearch("  SF123ABC ")).toBe("sf123abc");
    expect(normalizeSearch("Rahul Sharma")).toBe("sharma");
  });
});
