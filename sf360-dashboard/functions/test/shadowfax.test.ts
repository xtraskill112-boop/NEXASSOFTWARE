import { describe, expect, it, vi } from "vitest";

// The params module reads values from the environment at runtime; give the tests fixed values.
vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => (name === "SF_WEBHOOK_KEY" ? "hook-key" : "test-token") }),
  defineString: (name: string, opts?: { default?: string }) => ({
    name,
    value: () => (name === "ALLOWED_EMAILS" ? "owner@example.com" : (opts?.default ?? "")),
  }),
}));

import { parseAllowedEmails } from "../src/auth";
import {
  buildForwardOrderBody,
  buildUpdateBody,
  normalizeForwardTracking,
  parseCancel,
  parseForwardCreate,
  parseUpdate,
} from "../src/shadowfax/forward";
import { flattenErrors, sfRequest, ShadowfaxError } from "../src/shadowfax/http";
import { buildReverseOrderBody, normalizeReverseTracking, parseReverseCreate } from "../src/shadowfax/reverse";
import { evaluateLeg, legsFor, tiersFromResponse } from "../src/shadowfax/serviceability";
import { groupFor, isActiveStatus, reverseCodeFromDisplay } from "../src/shadowfax/status";
import { parseShadowfaxTime, parseWebhook } from "../src/shadowfax/webhook-parse";
import { mergeEvents, normalizeSearch, searchTokens, shipmentFromForward, statsDelta, applySnapshot } from "../src/model";
import { forwardOrderSchema, reverseOrderSchema, stripNulls } from "../src/validation";
import { extractKey, keysMatch } from "../src/webhook";

const order = {
  orderType: "marketplace",
  clientOrderId: "FWD-TEST-001",
  paymentMode: "cod",
  codAmount: "1299",
  productValue: 1299,
  customer: {
    name: "Rahul Sharma",
    contact: "98765 43210",
    address1: "42 MG Road, Koramangala",
    city: "BANGALORE",
    state: "Karnataka",
    pincode: "560034",
  },
  pickup: {
    name: "TechStore Pvt Ltd",
    contact: "9876543211",
    address1: "15 Industrial Area Phase 2",
    city: "BANGALORE",
    pincode: 560058,
    pickupDate: "2026-11-27",
  },
  returnType: "seller",
  returnAddress: {
    name: "TechStore Pvt Ltd",
    contact: "9876543211",
    address1: "15 Industrial Area Phase 2",
    city: "BANGALORE",
    pincode: 560058,
  },
  products: [{ name: "Wireless Bluetooth Headphones", skuId: "SKU-HEADPHONE-001", price: 1299, quantity: "1" }],
};

describe("validation", () => {
  it("accepts a documented order and normalises phone/pincode", () => {
    const o = forwardOrderSchema.parse(order);
    expect(o.customer.contact).toBe("9876543210");
    expect(o.customer.pincode).toBe(560034);
    expect(o.codAmount).toBe(1299);
  });

  it("rejects prepaid orders with a COD amount and big orders without e-way bill", () => {
    const r = forwardOrderSchema.safeParse({ ...order, paymentMode: "prepaid", productValue: 60000 });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["codAmount", "ewayBill", "sellerGstin"]));
  });

  it("treats nulls from the callable SDK as missing", () => {
    const withNulls = { ...order, ewayBill: null, sellerGstin: null, customer: { ...order.customer, locationType: null }, pickup: { ...order.pickup, pickupSlot: null } };
    expect(forwardOrderSchema.safeParse(stripNulls(withNulls)).success).toBe(true);
  });

  it("rejects pincodes starting with 0 and short phones", () => {
    const r = forwardOrderSchema.safeParse({ ...order, customer: { ...order.customer, pincode: "012345", contact: "12345" } });
    expect(r.success).toBe(false);
  });

  it("requires seller contact for return to seller (reverse)", () => {
    const r = reverseOrderSchema.safeParse({
      clientOrderId: "test_001",
      customer: { name: "Test Customer", contact: "9999999999", address1: "123 Test Street", city: "Bangalore", pincode: 560001 },
      returnType: "seller",
      returnAddress: { address1: "456 Hub Road", city: "Bangalore", pincode: 560002 },
      items: [{ name: "Blue T-Shirt", price: 500, returnReason: "Size mismatch" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("forward payloads", () => {
  it("builds the /v3/clients/orders/ body with documented field names", () => {
    const body = buildForwardOrderBody(forwardOrderSchema.parse(order));
    expect(body).toMatchObject({
      order_type: "marketplace",
      order_details: { client_order_id: "FWD-TEST-001", product_value: 1299, payment_mode: "cod", cod_amount: 1299 },
      customer_details: { name: "Rahul Sharma", contact: "9876543210", address_line_1: "42 MG Road, Koramangala", pincode: 560034 },
      pickup_details: { pickup_type: "seller", pincode: 560058, pickup_date: "2026-11-27" },
      return_details: { return_type: "seller", contact: "9876543211" },
      product_details: [{ sku_name: "Wireless Bluetooth Headphones", sku_id: "SKU-HEADPHONE-001", price: 1299, additional_details: { quantity: 1 } }],
    });
    // Nothing empty is sent.
    expect(JSON.stringify(body)).not.toContain('""');
  });

  it("forces return to origin and drops pickup slots for warehouse orders", () => {
    const body = buildForwardOrderBody(forwardOrderSchema.parse({ ...order, orderType: "warehouse" }));
    expect((body.return_details as Record<string, unknown>).return_type).toBe("origin");
    expect((body.pickup_details as Record<string, unknown>).pickup_type).toBe("warehouse");
    expect((body.pickup_details as Record<string, unknown>).pickup_date).toBeUndefined();
  });

  it("reads success, failure and duplicate answers (all HTTP 200)", () => {
    expect(parseForwardCreate(200, { message: "Success", errors: null, data: { awb_number: "SF401022456TST", status: "new" } })).toMatchObject({
      ok: true,
      awb: "SF401022456TST",
    });
    expect(parseForwardCreate(200, { message: "Failure", errors: "Payment Mode is Required" })).toEqual({
      ok: false,
      errors: ["Payment Mode is Required"],
      duplicateAwb: undefined,
    });
    expect(
      parseForwardCreate(200, {
        message: "Failure",
        errors: "Order for COID : Test warhosue32x0232 is already created with AWB : SF325110257MY",
        COID: "Test warhosue32x0232",
        AWB: "SF325110257MY",
      }),
    ).toMatchObject({ ok: false, duplicateAwb: "SF325110257MY" });
    expect(parseForwardCreate(200, { message: "Failure", errors: { order_details: { client_order_id: ["This field is required."] } }, data: {} }).ok).toBe(false);
    expect(parseForwardCreate(400, { message: "Cannot place an Order: Please clear your pending invoices to start placing order again" })).toMatchObject({
      ok: false,
      errors: ["Cannot place an Order: Please clear your pending invoices to start placing order again"],
    });
  });

  it("reads cancellation answers", () => {
    expect(parseCancel(200, { responseMsg: "Request has been marked as cancelled", responseCode: 200 })).toEqual({
      ok: true,
      queued: false,
      message: "Request has been marked as cancelled",
    });
    expect(parseCancel(200, { responseMsg: "Request is queued for cancellation.", responseCode: 304 }).queued).toBe(true);
    expect(parseCancel(400, { responseMsg: "Order cannot be cancelled. Invalid state.", responseCode: 400 }).ok).toBe(false);
  });

  it("builds order_update bodies with only changed sections and unwraps nested messages", () => {
    expect(buildUpdateBody({ awb: "SF1234567890", delivery: { contact: "9999888877" } } as never)).toEqual({
      awb_number: "SF1234567890",
      delivery_details: { contact: "9999888877" },
    });
    expect(buildUpdateBody({ awb: "SF1" } as never, "reopen_ndr")).toEqual({ awb_number: "SF1", status_update: { status: "reopen_ndr" } });
    expect(parseUpdate(400, { message: '{"message":"Intercity pincode updates are not allowed"}' }).message).toBe(
      "Intercity pincode updates are not allowed",
    );
  });

  it("normalises single and bulk tracking responses", () => {
    const single = normalizeForwardTracking({
      message: "Success",
      order_details: { awb_number: "SF222344412TST", client_order_id: "11002", status: "rts_nd", status_display: "Undelivered", payment_mode: "prepaid", customer_track_url: "https://exp.shadowfax.in/JdDYM6" },
      tracking_details: [
        { created: "2022-02-28T08:58:57Z", location: "SFX TestHub", status_id: "new", status: "New", remarks: "Item New at SFX TestHub" },
        { created: "2022-02-28T10:02:38Z", location: "SFX TestHub", status_id: "rts_nd", status: "Undelivered", remarks: "x" },
      ],
    });
    expect(single).toMatchObject({ awb: "SF222344412TST", statusId: "rts_nd", trackUrl: "https://exp.shadowfax.in/JdDYM6" });
    expect(single?.events).toHaveLength(2);
    // Apiary bulk shape: order fields at the top level.
    const flat = normalizeForwardTracking({ awb_number: "SF1360593963TES", status: "delivered", tracking_details: [] });
    expect(flat?.statusId).toBe("delivered");
  });
});

describe("reverse", () => {
  it("builds the pickup order body", () => {
    const o = reverseOrderSchema.parse({
      clientOrderId: "test_001",
      customer: { name: "Test Customer", contact: "9999999999", address1: "123 Test Street", city: "Bangalore", pincode: 560001 },
      returnType: "origin",
      returnAddress: { name: "Warehouse", address1: "456 Hub Road", city: "Bangalore", pincode: 560002 },
      items: [{ name: "Blue T-Shirt", price: 500, returnReason: "Size mismatch" }],
    });
    expect(buildReverseOrderBody(o)).toMatchObject({
      customer_details: { name: "Test Customer", address: "123 Test Street", pincode: 560001 },
      return_details: { return_type: "origin", address: "456 Hub Road", pincode: 560002 },
      order_details: { client_order_id: "test_001", pickup_type: "regular" },
      sku_details: [{ sku_name: "Blue T-Shirt", price: 500, return_reason: "Size mismatch", qc_required: false }],
    });
  });

  it("reads HTTP 400 field errors", () => {
    const r = parseReverseCreate(400, { message: "Failure", errors: { customer_details: { pincode: ["Invalid"] } } });
    expect(r).toEqual({ ok: false, errors: ["customer_details.pincode: Invalid"] });
  });

  it("maps display names from tracking to codes", () => {
    const snap = normalizeReverseTracking(
      {
        client_order_number: "222601_1_dnajqq",
        client_request_id: "R842568718MEE",
        status: "Out For Pickup",
        seller: { name: "x" },
        pickup_request_state_histories: [
          { created_at: "2026-03-30T10:00:00Z", current_location: "Hub", state: "New", comment: "" },
          { created_at: "2026-03-30T12:00:00Z", current_location: "Hub", state: "Out For Pickup", comment: "" },
        ],
      },
      null,
    );
    expect(snap).toMatchObject({ awb: "R842568718MEE", statusId: "ofp", returnType: "seller" });
    expect(reverseCodeFromDisplay("Returned To Client", "origin")).toBe("rto_d");
  });
});

describe("statuses", () => {
  it("groups statuses for the dashboard", () => {
    expect(groupFor("forward", "ofd")).toBe("out_for_delivery");
    expect(groupFor("forward", "rts_d")).toBe("rto");
    expect(groupFor("forward", "nc")).toBe("ndr");
    expect(groupFor("forward", "assigned_for_seller_pickup")).toBe("pickup_pending");
    expect(groupFor("reverse", "rto_d")).toBe("delivered");
    expect(groupFor("forward", "something_new")).toBe("other");
  });

  it("keeps cancelled-after-pickup shipments active (they come back)", () => {
    expect(isActiveStatus("cancelled_by_customer", ["new"])).toBe(false);
    expect(isActiveStatus("cancelled_by_customer", ["new", "picked"])).toBe(true);
    expect(isActiveStatus("delivered")).toBe(false);
  });
});

describe("serviceability", () => {
  it("checks every leg with the documented service and tier", () => {
    const legs = legsFor({ kind: "forward", orderType: "marketplace", returnType: "seller", pickupPincode: 110005, customerPincode: 110009 });
    expect(legs.map((l) => l.service)).toEqual(["seller_pickup", "customer_delivery", "seller_delivery"]);
    const tiers = tiersFromResponse([{ code: 110005, services: ["Marketplace"] }], 110005);
    expect(evaluateLeg(legs[0], tiers, "regular").serviceable).toBe(true);
    expect(evaluateLeg(legs[0], tiers, "surface").serviceable).toBe(false);
    expect(tiersFromResponse([{ code: 1, services: ["Regular"] }], 110005)).toEqual([]);
  });
});

describe("webhooks", () => {
  it("reads the forward callback sample", () => {
    const u = parseWebhook(
      {
        awb_number: "SF610198449AAA",
        order_id: "FL20230517311447364",
        event_timestamp: "2023-05-18 16:22:13",
        current_location: "CHN_Ambattur_EXP",
        comments: "Item Delivered at CHN_Ambattur_EXP",
        event: "delivered",
        status: "Delivered",
        otp_verified: "Y",
        recipient_info: { recipient: "Customer", recipient_name: "Chittaranjan" },
        type: "FWD",
      },
      new Date(),
    );
    expect(u).toMatchObject({ awb: "SF610198449AAA", kind: "forward", event: { statusId: "delivered", at: "2023-05-18T10:52:13.000Z" } });
    expect(u.recipientInfo).toMatchObject({ recipient_name: "Chittaranjan" });
  });

  it("reads the reverse sample where event is an integer", () => {
    const u = parseWebhook(
      { awb_number: "R842568718MEE", event_timestamp: "2026-04-01T14:30:00+05:30", event: 5, status: "Picked", type: "REV" },
      new Date(),
    );
    expect(u).toMatchObject({ kind: "reverse", event: { statusId: "picked", at: "2026-04-01T09:00:00.000Z" } });
  });

  it("prefers status_id from custom templates", () => {
    expect(parseWebhook({ awb: "SF1", status_id: "recd_at_fwd_hub", status: "Received At Forward Hub" }, new Date()).event?.statusId).toBe("recd_at_fwd_hub");
    expect(parseShadowfaxTime(null, "2023-05-18", "1622")).toBe("2023-05-18T10:52:00.000Z");
  });

  it("checks the shared key in constant time", () => {
    expect(extractKey({ authorization: "Token hook-key" })).toBe("hook-key");
    expect(extractKey({ "x-sf360-key": "abc" })).toBe("abc");
    expect(keysMatch("hook-key", "hook-key")).toBe(true);
    expect(keysMatch("hook-kex", "hook-key")).toBe(false);
    expect(keysMatch(null, "hook-key")).toBe(false);
  });
});

describe("model", () => {
  it("merges timelines without duplicates", () => {
    const a = { at: "2026-01-01T00:00:00.000Z", statusId: "new", status: "New", location: null, remarks: null, source: "webhook" as const };
    const b = { ...a, source: "track" as const, location: "Hub" };
    const c = { ...a, at: "2026-01-02T00:00:00.000Z", statusId: "picked", status: "Picked" };
    const merged = mergeEvents([a], [b, c]);
    expect(merged).toHaveLength(2);
    expect(merged[0].location).toBe("Hub");
  });

  it("builds search tokens for name prefixes, phone and ids", () => {
    const t = searchTokens({ awb: "SF123ABC", clientOrderId: "ORD-9", name: "Rahul Sharma", phones: ["+91 98765 43210"] });
    expect(t).toEqual(expect.arrayContaining(["sf123abc", "ord-9", "9876543210", "ra", "rahul", "sha", "sharma"]));
    expect(normalizeSearch("+91 98765-43210")).toBe("9876543210");
    expect(normalizeSearch("Rahul")).toBe("rahul");
  });

  it("moves dashboard counters by the difference only", () => {
    const now = new Date("2026-11-26T10:00:00Z");
    const s = shipmentFromForward(forwardOrderSchema.parse(order), "SF1", {}, { env: "staging", now, by: "owner@example.com", source: "app" });
    expect(statsDelta(null, s)).toEqual({ forward_total: 1, forward_booked: 1, cod_count: 1, cod_amount: 1299 });
    const delivered = applySnapshot(
      s,
      {
        awb: "SF1",
        clientOrderId: null,
        statusId: "delivered",
        statusDisplay: "Delivered",
        events: [{ at: "2026-11-27T10:00:00.000Z", statusId: "delivered", status: "Delivered", location: null, remarks: null, source: "track" }],
        trackUrl: null,
        paymentMode: null,
        codAmount: null,
        productValue: null,
        orderDate: null,
        deliveryCity: null,
        deliveryPincode: null,
        returnType: null,
      },
      now,
    );
    expect(delivered.statusGroup).toBe("delivered");
    expect(delivered.isActive).toBe(false);
    expect(statsDelta(s, delivered)).toEqual({ forward_booked: -1, forward_delivered: 1, cod_delivered_amount: 1299 });
  });
});

describe("http client", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("sends Token auth and returns business errors instead of throwing", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Token abc");
      return json(200, { message: "Failure", errors: "x" });
    });
    const r = await sfRequest({ env: "staging", method: "POST", path: "/v3/clients/orders/", body: {}, retry: "throttle-only", token: "Token abc", fetchImpl: fetchImpl as never });
    expect(r.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://dale.staging.shadowfax.in/api/v3/clients/orders/");
  });

  it("retries 429 and then succeeds", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (n++ === 0 ? json(429, { responseMsg: "Request Blocked Temporarily", responseCode: 429 }) : json(200, [])));
    const r = await sfRequest({ env: "production", method: "GET", path: "/v1/clients/serviceability/", retry: "safe", token: "t", fetchImpl: fetchImpl as never, sleep: async () => undefined });
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never retries a write after a 500 and reports 401 clearly", async () => {
    const fetch500 = vi.fn(async () => json(500, { message: "Internal Server Error" }));
    await expect(
      sfRequest({ env: "staging", method: "POST", path: "/x", body: {}, retry: "throttle-only", token: "t", fetchImpl: fetch500 as never, sleep: async () => undefined }),
    ).rejects.toBeInstanceOf(ShadowfaxError);
    expect(fetch500).toHaveBeenCalledTimes(1);
    const fetch401 = vi.fn(async () => json(401, { detail: "Invalid token." }));
    await expect(sfRequest({ env: "staging", method: "GET", path: "/x", retry: "safe", token: "t", fetchImpl: fetch401 as never })).rejects.toMatchObject({ kind: "auth" });
  });

  it("flattens nested error objects", () => {
    expect(flattenErrors({ order_details: { awb_number: ["order with this awb number already exists."] } })).toEqual([
      "order_details.awb_number: order with this awb number already exists.",
    ]);
  });
});

describe("auth", () => {
  it("parses the allow-list", () => {
    expect([...parseAllowedEmails(" Owner@Example.com, second@example.com ;bad")]).toEqual(["owner@example.com", "second@example.com"]);
  });
});
