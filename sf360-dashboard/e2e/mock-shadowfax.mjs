#!/usr/bin/env node
/**
 * A tiny stand-in for the Shadowfax client gateway, for local end-to-end tests only.
 * Responses copy the shapes from the official docs. Listens on 127.0.0.1:4010.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const TOKEN = process.env.MOCK_TOKEN ?? "test-token";
const orders = new Map();
let seq = 1000;

const TIERS = {
  customer_delivery: ["Regular", "Surface"],
  customer_pickup: ["Regular"],
  seller_pickup: ["Marketplace"],
  seller_delivery: ["RTS"],
  warehouse_pickup: ["dc_pickup"],
  warehouse_return: ["RTO"],
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function event(o, statusId, status, location = "SFX TestHub") {
  o.tracking_details.push({ created: new Date().toISOString(), location, status_id: statusId, status, remarks: `${status} at ${location}`, awb_number: o.awb_number });
  o.status = statusId;
  o.status_display = status;
}

function forwardView(o) {
  const { tracking_details, ...order } = o;
  return { order_details: order, tracking_details };
}

function reverseView(o) {
  return {
    client_order_number: o.client_order_id,
    request_type: "pickup",
    client_request_id: o.awb_number,
    client_id: 1,
    destination_pincode: o.return_pincode,
    price: null,
    address: { name: "", phone_number: "", address_line: "", city: o.city, state: "", pincode: o.pincode, alternate_contact: "" },
    skus: [],
    seller: o.return_type === "seller" ? { name: "" } : null,
    status: o.status_display,
    pickup_request_state_histories: o.tracking_details.map((e) => ({ created_at: e.created, current_location: e.location, state: e.status, comment: e.remarks })),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  const path = url.pathname;

  // Test helper: move a shipment to another status (simulates Shadowfax operations).
  if (path === "/__test/advance") {
    const o = orders.get(body.awb);
    if (!o) return send(res, 404, { message: "no such awb" });
    event(o, body.status_id, body.status);
    return send(res, 200, { ok: true });
  }

  if (req.headers.authorization !== `Token ${TOKEN}`) {
    return send(res, 401, { status: "FAILED", errorCode: "Authentication credentials not provided", message: "Authentication credentials not provided" });
  }

  if (req.method === "GET" && path === "/v1/clients/serviceability/") {
    const service = url.searchParams.get("service");
    const pins = (url.searchParams.get("pincodes") ?? "").split(",").filter(Boolean);
    return send(res, 200, pins.filter((p) => /^[1-9]\d{5}$/.test(p) && p !== "999999").map((p) => ({ code: Number(p), services: TIERS[service] ?? [] })));
  }

  if (req.method === "POST" && path === "/v3/clients/orders/") {
    const id = body.order_details?.client_order_id;
    if (!id) return send(res, 200, { message: "Failure", errors: { order_details: { client_order_id: ["This field is required."] } }, data: {} });
    const dup = [...orders.values()].find((o) => o.client_order_id === id);
    if (dup) return send(res, 200, { message: "Failure", errors: `Order for COID : ${id} is already created with AWB : ${dup.awb_number}`, COID: id, AWB: dup.awb_number });
    if (String(body.customer_details?.pincode) === "999999") {
      return send(res, 200, { message: "Failure", errors: "Invalid Delivery Pincode. Pincode 999999 is not serviceble" });
    }
    const awb = `SF${++seq}TST`;
    const o = {
      id: seq,
      client_name: "Test Client",
      client_order_id: id,
      awb_number: awb,
      product_value: body.order_details.product_value,
      cod_amount: body.order_details.cod_amount,
      payment_mode: body.order_details.payment_mode,
      order_date: new Date().toISOString().slice(0, 10),
      status: "new",
      status_display: "New",
      delivery_details: { city: body.customer_details.city, pincode: body.customer_details.pincode },
      customer_track_url: "https://example.com/track",
      sort_code: "BLR-01",
      tracking_details: [],
      kind: "forward",
    };
    event(o, "new", "New");
    orders.set(awb, o);
    const { tracking_details, ...data } = o;
    return send(res, 200, { message: "Success", errors: null, data });
  }

  let m;
  if (req.method === "GET" && (m = path.match(/^\/v4\/clients\/orders\/([A-Za-z0-9]+)\/track\/$/))) {
    const o = orders.get(m[1]);
    return o ? send(res, 200, { message: "Success", ...forwardView(o) }) : send(res, 400, { message: "Invalid AWB number" });
  }
  if (req.method === "POST" && path === "/v4/clients/bulk_track/") {
    return send(res, 200, { message: "Success", data: (body.awb_numbers ?? []).map((a) => orders.get(a)).filter(Boolean).map(forwardView) });
  }
  if (req.method === "POST" && path === "/v3/clients/orders/cancel/") {
    const o = orders.get(body.request_id);
    if (!o) return send(res, 400, { responseMsg: "Please enter a valid AWB Number", responseCode: 400 });
    if (o.status === "delivered") return send(res, 400, { responseMsg: "Order cannot be cancelled. Invalid state.", responseCode: 400 });
    event(o, "cancelled_by_customer", "Cancelled");
    return send(res, 200, { responseMsg: "Request has been marked as cancelled", responseCode: 200 });
  }
  if (req.method === "POST" && path === "/v3/clients/order_update/") {
    return orders.has(body.awb_number) ? send(res, 200, { message: "Request accepted." }) : send(res, 400, { message: "Invalid AWB" });
  }
  if (req.method === "POST" && path === "/client/generate_label/") {
    return send(res, 200, { message: "Success", data: { label_url: `https://example.com/labels/${body.awb_number}.pdf` } });
  }
  if (req.method === "POST" && path === "/v1/clients/pod_details/") {
    const pod = {};
    for (const a of body.awb_numbers ?? []) pod[a] = orders.get(a)?.status === "delivered" ? { recipient: "Customer", recipient_name: "Rahul", recipient_contact: "None", recipient_signature: [] } : {};
    return send(res, 200, { message: "Success", pod_details: pod });
  }
  if (req.method === "POST" && path === "/v1/clients/rate_calculator/") {
    return send(res, 200, { message: "Success", zone: "E", shipping_rate: "62.00", gst: "11.16" });
  }
  if (req.method === "POST" && path === "/v1/clients/pickup/orders/") {
    const id = body.order_details?.client_order_id;
    if (!body.customer_details?.pincode) return send(res, 400, { message: "Failure", errors: { customer_details: { pincode: ["This field is required."] } } });
    const awb = `R${++seq}TST`;
    const o = {
      awb_number: awb,
      client_order_id: id,
      city: body.customer_details.city,
      pincode: body.customer_details.pincode,
      return_pincode: body.return_details.pincode,
      return_type: body.return_details.return_type,
      status: "new",
      status_display: "New",
      tracking_details: [],
      kind: "reverse",
    };
    event(o, "new", "New");
    orders.set(awb, o);
    return send(res, 200, { message: "Success", data: { client_order_id: id, awb_number: awb, status: "new", order_date: new Date().toISOString().slice(0, 10), pickup_type: "regular" }, errors: null });
  }
  if (req.method === "GET" && (m = path.match(/^\/v4\/clients\/requests\/([A-Za-z0-9]+)$/))) {
    const o = orders.get(m[1]);
    return o?.kind === "reverse" ? send(res, 200, reverseView(o)) : send(res, 400, { responseMsg: "Invalid AWB Number", responseCode: 400 });
  }
  if (req.method === "POST" && path === "/v4/clients/requests/bulk_query") {
    const out = {};
    for (const a of body.request_ids ?? []) if (orders.get(a)?.kind === "reverse") out[a] = [reverseView(orders.get(a))];
    return send(res, 200, out);
  }
  if (req.method === "POST" && path === "/v2/clients/requests/mark_cancel") {
    const o = orders.get(body.request_id);
    if (!o) return send(res, 400, { responseMsg: "Invalid AWB Number", responseCode: 400 });
    event(o, "cancelled_by_customer", "Cancelled");
    return send(res, 200, { responseMsg: "Request has been marked as cancelled", responseCode: 200 });
  }
  return send(res, 404, { message: `Mock: no route for ${req.method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock shadowfax on http://127.0.0.1:${PORT}`));
