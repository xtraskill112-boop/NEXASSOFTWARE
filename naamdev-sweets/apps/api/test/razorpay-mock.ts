import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";

/**
 * Minimal stateful stand-in for the Razorpay REST API used only by the test-suite. It lets the
 * tests drive the real signature-verification, capture, webhook and refund code paths.
 */
interface MockOrder { id: string; amount: number; currency: string; receipt: string; status: string }
interface MockPayment { id: string; order_id: string; amount: number; currency: string; status: string; method: string }
interface MockRefund { id: string; payment_id: string; amount: number; status: string }

export function startRazorpayMock(port: number): Promise<Server> {
  const orders = new Map<string, MockOrder>();
  const payments = new Map<string, MockPayment>();
  const refunds = new Map<string, MockRefund>();
  const id = (p: string) => `${p}_${randomBytes(7).toString("hex")}`;

  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const url = req.url ?? "";
      if (!req.headers.authorization?.startsWith("Basic ") && !url.startsWith("/__test")) return send(401, { error: { description: "Authentication failed" } });
      let m: RegExpMatchArray | null;
      if (req.method === "POST" && url === "/orders") {
        const o = { id: id("order"), amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" };
        orders.set(o.id, o);
        return send(200, o);
      }
      if (req.method === "POST" && url === "/__test/pay") {
        const o = orders.get(body.order_id);
        if (!o) return send(404, { error: { description: "order not found" } });
        const p = { id: id("pay"), order_id: o.id, amount: body.amount ?? o.amount, currency: "INR", status: body.status ?? "captured", method: "upi" };
        payments.set(p.id, p);
        o.status = "paid";
        return send(200, p);
      }
      if (req.method === "POST" && url === "/__test/refund-status") {
        const r = refunds.get(body.id);
        if (r) r.status = body.status;
        return send(200, r ?? {});
      }
      if (req.method === "GET" && (m = url.match(/^\/payments\/([^/]+)$/))) {
        const p = payments.get(m[1]!);
        return p ? send(200, p) : send(404, { error: { description: "payment not found" } });
      }
      if (req.method === "GET" && (m = url.match(/^\/orders\/([^/]+)\/payments$/))) {
        return send(200, { items: [...payments.values()].filter((p) => p.order_id === m![1]) });
      }
      if (req.method === "POST" && (m = url.match(/^\/payments\/([^/]+)\/refund$/))) {
        const p = payments.get(m[1]!);
        if (!p) return send(400, { error: { description: "payment not found" } });
        const r = { id: id("rfnd"), payment_id: p.id, amount: body.amount, status: "pending" };
        refunds.set(r.id, r);
        return send(200, r);
      }
      if (req.method === "GET" && (m = url.match(/^\/refunds\/([^/]+)$/))) {
        const r = refunds.get(m[1]!);
        return r ? send(200, r) : send(404, { error: { description: "refund not found" } });
      }
      send(404, { error: { description: `no mock for ${req.method} ${url}` } });
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
