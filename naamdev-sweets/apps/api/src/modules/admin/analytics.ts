import { Router } from "express";
import { AggregateField } from "firebase-admin/firestore";
import { z } from "zod";
import {
  C, countOf, db, getDocs,
  type Coupon, type CouponUsage, type DeliveryAssignment, type DeliveryPartner, type InventoryBatch, type Order, type PartnerEarning, type User,
} from "@naamdev/db";
import { ORDER_STATUSES } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { toCsv } from "../../lib/csv";
import { badRequest } from "../../lib/errors";
import { param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";
import { catalog } from "../catalog/cache";

export const adminAnalyticsRouter = Router();

/** Realised revenue: money actually received (online paid or COD collected) net of refunds. */
const REVENUE_STATUSES = ["PAID", "COD_COLLECTED", "PARTIALLY_REFUNDED", "REFUNDED"];
const isRevenue = (o: Order) => REVENUE_STATUSES.includes(o.paymentStatus);
const net = (o: Order) => o.totalPaise - o.refundedPaise;

function istStartOfDay(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000 - offsetDays * 86_400_000);
}
const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

const ordersBetween = (from: Date, to?: Date) => {
  let q = db.collection(C.orders).where("createdAt", ">=", from);
  if (to) q = q.where("createdAt", "<=", to);
  return getDocs<Order>(q.orderBy("createdAt", "asc"));
};

async function allTimeRevenue() {
  const agg = await db.collection(C.orders).where("paymentStatus", "in", REVENUE_STATUSES)
    .aggregate({ total: AggregateField.sum("totalPaise"), refunded: AggregateField.sum("refundedPaise"), n: AggregateField.count() }).get();
  const d = agg.data();
  return { revenuePaise: (d.total ?? 0) - (d.refunded ?? 0), orders: d.n };
}

adminAnalyticsRouter.get("/dashboard", requirePermission("dashboard.view"), async (req, res) => {
  const canMoney = req.auth!.permissions.includes("analytics.view");
  const today = istStartOfDay();
  const week = istStartOfDay(6);
  const month = istStartOfDay(29);
  const notif = await getSetting("notifications");
  const users = db.collection(C.users);

  const [total, monthOrders, statusCounts, customers, deletedCustomers, newCustomers, snap, expiringBatches, busy, ready, openTickets, pendingReviews, pendingPartners] = await Promise.all([
    allTimeRevenue(),
    ordersBetween(month),
    Promise.all(ORDER_STATUSES.map(async (s) => [s, await countOf(db.collection(C.orders).where("status", "==", s))] as const)),
    countOf(users.where("roleKey", "==", "CUSTOMER")),
    countOf(users.where("roleKey", "==", "CUSTOMER").where("status", "==", "DELETED")),
    countOf(users.where("roleKey", "==", "CUSTOMER").where("createdAt", ">=", month)),
    catalog(),
    getDocs<InventoryBatch>(db.collection(C.batches).where("status", "==", "ACTIVE").where("expiresAt", "<=", new Date(Date.now() + notif.expiryAlertDays * 86_400_000))),
    getDocs<DeliveryAssignment>(db.collection(C.assignments).where("status", "in", ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"])),
    getDocs<Order>(db.collection(C.orders).where("status", "in", ["PACKED", "READY_FOR_PICKUP"]).select("status")),
    countOf(db.collection(C.tickets).where("status", "in", ["OPEN", "IN_PROGRESS"])),
    countOf(db.collection(C.reviews).where("status", "==", "PENDING")),
    countOf(db.collection(C.partners).where("status", "==", "PENDING")),
  ]);

  const revenueSince = (from: Date) => {
    const rows = monthOrders.filter((o) => o.createdAt >= from && isRevenue(o));
    return { revenuePaise: rows.reduce((s, o) => s + net(o), 0), orders: rows.length };
  };
  const counts = Object.fromEntries(statusCounts.filter(([, n]) => n > 0)) as Record<string, number>;
  const sum = (keys: string[]) => keys.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const totalOrders = Object.values(counts).reduce((a, b) => a + b, 0);
  const busyOrders = new Set(busy.map((a) => a.orderId));
  const live = monthOrders.filter((o) => o.status !== "CANCELLED");

  const lowStock = [...snap.stock.values()]
    .map((i) => ({ i, hit: snap.variants.get(i.id) }))
    .filter(({ i, hit }) => hit && hit.variant.isActive && hit.product.isActive && !hit.product.deletedAt && i.available <= i.lowStockThreshold)
    .sort((a, b) => a.i.available - b.i.available)
    .slice(0, 10)
    .map(({ i, hit }) => ({ variantId: i.id, productName: hit!.product.name, label: hit!.variant.label, available: i.available, threshold: i.lowStockThreshold }));

  const bestMap = new Map<string, { productId: string; name: string; quantity: number; revenuePaise: number }>();
  const catMap = new Map<string, number>();
  for (const o of live)
    for (const it of o.items) {
      const b = bestMap.get(it.productId) ?? { productId: it.productId, name: it.productName, quantity: 0, revenuePaise: 0 };
      b.quantity += it.quantity;
      b.revenuePaise += it.lineTotalPaise;
      bestMap.set(it.productId, b);
      const cat = snap.categoryById.get(it.categoryId)?.name ?? snap.categoryById.get(snap.byId.get(it.productId)?.categoryId ?? "")?.name ?? "Other";
      catMap.set(cat, (catMap.get(cat) ?? 0) + it.lineTotalPaise);
    }

  const series: { date: string; revenuePaise: number; orders: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = istDate(istStartOfDay(i));
    const dayOrders = monthOrders.filter((o) => istDate(o.createdAt) === d);
    series.push({ date: d, revenuePaise: dayOrders.filter(isRevenue).reduce((s, o) => s + net(o), 0), orders: dayOrders.filter((o) => o.status !== "CANCELLED").length });
  }
  const paymentSplit = (["COD", "UPI", "ONLINE"] as const)
    .map((method) => {
      const rows = live.filter((o) => o.paymentMethod === method);
      return { method, orders: rows.length, amountPaise: rows.reduce((s, o) => s + o.totalPaise, 0) };
    })
    .filter((p) => p.orders > 0);

  res.json({
    revenue: canMoney
      ? {
          totalPaise: total.revenuePaise, todayPaise: revenueSince(today).revenuePaise, weekPaise: revenueSince(week).revenuePaise, monthPaise: revenueSince(month).revenuePaise,
          averageOrderValuePaise: total.orders ? Math.round(total.revenuePaise / total.orders) : 0,
        }
      : null,
    orders: {
      total: totalOrders,
      pending: sum(["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"]),
      kitchen: sum(["CONFIRMED", "PROCESSING", "PREPARING"]),
      delivered: sum(["DELIVERED"]),
      cancelled: sum(["CANCELLED"]),
      refunds: sum(["REFUND_INITIATED", "REFUNDED"]),
      today: revenueSince(today).orders,
      byStatus: counts,
      unassigned: ready.filter((o) => !busyOrders.has(o.id)).length,
    },
    customers: { total: customers - deletedCustomers, newLast30Days: newCustomers },
    attention: { openTickets, pendingReviews, pendingPartners },
    lowStock,
    expiring: expiringBatches
      .filter((b) => b.remaining > 0)
      .sort((a, b) => +a.expiresAt - +b.expiresAt)
      .slice(0, 10)
      .map((b) => {
        const hit = snap.variants.get(b.variantId);
        return { batchId: b.id, batchNumber: b.batchNumber, product: hit?.product.name ?? "", variant: hit?.variant.label ?? "", remaining: b.remaining, expiresAt: b.expiresAt };
      }),
    bestsellers: [...bestMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8).map((b) => ({ ...b, revenuePaise: canMoney ? b.revenuePaise : null })),
    charts: canMoney
      ? {
          daily: series,
          categoryShare: [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, revenuePaise]) => ({ category, revenuePaise })),
          paymentSplit,
        }
      : null,
  });
});

// ── Reports ──
const reportQuery = z.object({
  from: z.coerce.date().default(() => new Date(Date.now() - 30 * 86_400_000)),
  to: z.coerce.date().default(() => new Date()),
  format: z.enum(["json", "csv"]).default("json"),
});

const REPORTS = ["sales", "orders", "products", "inventory", "customers", "coupons", "delivery", "gst"] as const;
type ReportType = (typeof REPORTS)[number];

async function buildReport(type: ReportType, from: Date, to: Date): Promise<Record<string, unknown>[]> {
  const rupees = (p: number | null | undefined) => (Number(p ?? 0) / 100).toFixed(2);
  switch (type) {
    case "sales": {
      const byDay = new Map<string, { orders: number; gross: number; discounts: number; delivery: number; tax: number; refunds: number; net: number }>();
      for (const o of (await ordersBetween(from, to)).filter(isRevenue)) {
        const d = istDate(o.createdAt);
        const r = byDay.get(d) ?? { orders: 0, gross: 0, discounts: 0, delivery: 0, tax: 0, refunds: 0, net: 0 };
        r.orders++;
        r.gross += o.subtotalPaise;
        r.discounts += o.couponDiscountPaise + o.loyaltyDiscountPaise;
        r.delivery += o.deliveryFeePaise;
        r.tax += o.taxPaise;
        r.refunds += o.refundedPaise;
        r.net += net(o);
        byDay.set(d, r);
      }
      return [...byDay.entries()].sort().map(([date, r]) => ({ date, orders: r.orders, gross_sales: rupees(r.gross), discounts: rupees(r.discounts), delivery_fees: rupees(r.delivery), gst: rupees(r.tax), refunds: rupees(r.refunds), net_revenue: rupees(r.net) }));
    }
    case "orders": {
      const rows = await ordersBetween(from, to);
      return rows.map((o) => ({ order_number: o.orderNumber, invoice_number: o.invoiceNumber ?? "", date: o.createdAt, status: o.status, payment_method: o.paymentMethod, payment_status: o.paymentStatus, customer: o.customerName, pincode: o.deliveryPincode, items: o.items.reduce((s, i) => s + i.quantity, 0), subtotal: rupees(o.subtotalPaise), discount: rupees(o.couponDiscountPaise + o.loyaltyDiscountPaise), delivery_fee: rupees(o.deliveryFeePaise), gst: rupees(o.taxPaise), total: rupees(o.totalPaise), refunded: rupees(o.refundedPaise), coupon: o.couponCode ?? "" }));
    }
    case "products": {
      const m = new Map<string, { name: string; variant: string; sku: string; quantity: number; revenue: number; orders: Set<string> }>();
      for (const o of (await ordersBetween(from, to)).filter((x) => x.status !== "CANCELLED"))
        for (const i of o.items) {
          const key = `${i.productName}|${i.sku}|${i.variantLabel}`;
          const r = m.get(key) ?? { name: i.productName, variant: i.variantLabel, sku: i.sku, quantity: 0, revenue: 0, orders: new Set<string>() };
          r.quantity += i.quantity;
          r.revenue += i.lineTotalPaise;
          r.orders.add(o.id);
          m.set(key, r);
        }
      return [...m.values()].sort((a, b) => b.quantity - a.quantity).map((r) => ({ product: r.name, variant: r.variant, sku: r.sku, units_sold: r.quantity, orders: r.orders.size, revenue: rupees(r.revenue) }));
    }
    case "inventory": {
      const snap = await catalog();
      const active = await getDocs<InventoryBatch>(db.collection(C.batches).where("status", "==", "ACTIVE"));
      return snap.products
        .filter((p) => !p.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((p) =>
          p.variants.map((v) => {
            const inv = snap.stock.get(v.id);
            const batches = active.filter((b) => b.variantId === v.id).sort((a, b) => +a.expiresAt - +b.expiresAt);
            return { product: p.name, variant: v.label, sku: v.sku, available: inv?.available ?? 0, reserved: inv?.reserved ?? 0, low_stock_threshold: inv?.lowStockThreshold ?? 0, active_batches: batches.length, next_expiry: batches[0]?.expiresAt ?? "", stock_value_at_cost: rupees(batches.reduce((s, b) => s + b.remaining * b.costPricePaise, 0)) };
          }),
        );
    }
    case "customers": {
      const [customers, orders] = await Promise.all([
        getDocs<User>(db.collection(C.users).where("roleKey", "==", "CUSTOMER")),
        getDocs<Order>(db.collection(C.orders).where("createdAt", "<=", to)),
      ]);
      return customers
        .filter((u) => u.status !== "DELETED" && u.createdAt <= to)
        .map((u) => {
          const mine = orders.filter((o) => o.userId === u.id);
          const spend = mine.filter(isRevenue).reduce((s, o) => s + net(o), 0);
          const last = mine.reduce<Date | null>((d, o) => (!d || o.createdAt > d ? o.createdAt : d), null);
          return { name: u.name, email: u.email ?? "", phone: u.phone ?? "", joined: u.createdAt, orders: mine.length, lifetime_spend: spend, last_order: last ?? "" };
        })
        .sort((a, b) => b.lifetime_spend - a.lifetime_spend)
        .map((r) => ({ ...r, lifetime_spend: rupees(r.lifetime_spend) }));
    }
    case "coupons": {
      const [coupons, usages] = await Promise.all([
        getDocs<Coupon>(db.collection(C.coupons)),
        getDocs<CouponUsage>(db.collection(C.couponUsages).where("createdAt", ">=", from).where("createdAt", "<=", to)),
      ]);
      const orders = new Map((await getDocs<Order>(db.collection(C.orders).where("createdAt", ">=", from).where("createdAt", "<=", to))).map((o) => [o.id, o]));
      return coupons
        .map((c) => {
          const used = usages.filter((u) => u.couponCode === c.code);
          return { code: c.code, uses: used.length, total_discount: rupees(used.reduce((s, u) => s + u.discountPaise, 0)), order_value: rupees(used.reduce((s, u) => s + (orders.get(u.orderId)?.totalPaise ?? 0), 0)) };
        })
        .sort((a, b) => b.uses - a.uses);
    }
    case "delivery": {
      const [partners, assignments, earnings] = await Promise.all([
        getDocs<DeliveryPartner>(db.collection(C.partners)),
        getDocs<DeliveryAssignment>(db.collection(C.assignments).where("createdAt", ">=", from).where("createdAt", "<=", to)),
        getDocs<PartnerEarning>(db.collection(C.earnings).where("createdAt", ">=", from).where("createdAt", "<=", to)),
      ]);
      return partners
        .map((p) => {
          const mine = assignments.filter((a) => a.partnerId === p.id);
          const delivered = mine.filter((a) => a.status === "DELIVERED");
          const times = delivered.filter((a) => a.pickedUpAt && a.deliveredAt).map((a) => (+a.deliveredAt! - +a.pickedUpAt!) / 60_000);
          return {
            partner: p.name, phone: p.phone ?? "", delivered: delivered.length, declined_or_expired: mine.filter((a) => a.status === "REJECTED" || a.status === "EXPIRED").length,
            avg_delivery_minutes: times.length ? (times.reduce((s, t) => s + t, 0) / times.length).toFixed(1) : "",
            earnings: rupees(earnings.filter((e) => e.partnerId === p.id).reduce((s, e) => s + e.amountPaise, 0)),
          };
        })
        .sort((a, b) => b.delivered - a.delivered);
    }
    case "gst": {
      const byRate = new Map<number, { taxable: number; tax: number; lines: number }>();
      for (const o of (await ordersBetween(from, to)).filter(isRevenue))
        for (const i of o.items) {
          const r = byRate.get(i.gstRate) ?? { taxable: 0, tax: 0, lines: 0 };
          r.taxable += i.lineTotalPaise - i.discountPaise;
          r.tax += i.taxPaise;
          r.lines++;
          byRate.set(i.gstRate, r);
        }
      return [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, r]) => ({ gst_rate_percent: rate, line_items: r.lines, value_incl_or_excl_tax: rupees(r.taxable), gst_amount: rupees(r.tax), cgst: rupees(r.tax / 2), sgst: rupees(r.tax / 2) }));
    }
  }
}

adminAnalyticsRouter.get("/reports/:type", requireAnyPermission("analytics.view", "reports.export"), async (req, res) => {
  const type = param(req, "type") as ReportType;
  if (!REPORTS.includes(type)) throw badRequest("Unknown report");
  const { from, to, format } = query(req, reportQuery);
  if (format === "csv" && !req.auth!.permissions.includes("reports.export")) throw badRequest("You need export permission to download reports.");
  const rows = await buildReport(type, from, to);
  if (format === "csv") {
    await audit(req, "report.export", "Report", type, { from, to, rows: rows.length });
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="naamdev-${type}-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"` });
    return res.send(toCsv(rows));
  }
  res.json({ type, from, to, rows });
});
