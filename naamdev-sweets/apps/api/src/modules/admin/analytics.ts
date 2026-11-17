import { Router } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@naamdev/db";
import { audit } from "../../lib/audit";
import { toCsv } from "../../lib/csv";
import { badRequest } from "../../lib/errors";
import { param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";

export const adminAnalyticsRouter = Router();

/** Realised revenue: money actually received (online paid or COD collected) net of refunds. */
const REVENUE_STATUSES = Prisma.sql`('PAID','COD_COLLECTED','PARTIALLY_REFUNDED','REFUNDED')`;

function istStartOfDay(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000 - offsetDays * 86_400_000);
}

async function revenueSince(from?: Date) {
  const rows = await prisma.$queryRaw<{ revenue: bigint | null; orders: bigint }[]>`
    SELECT COALESCE(SUM("totalPaise" - "refundedPaise"), 0) AS revenue, COUNT(*) AS orders FROM "Order"
    WHERE "paymentStatus"::text IN ${REVENUE_STATUSES} ${from ? Prisma.sql`AND "createdAt" >= ${from}` : Prisma.empty}`;
  return { revenuePaise: Number(rows[0]?.revenue ?? 0), orders: Number(rows[0]?.orders ?? 0) };
}

adminAnalyticsRouter.get("/dashboard", requirePermission("dashboard.view"), async (req, res) => {
  const canMoney = req.auth!.permissions.includes("analytics.view");
  const today = istStartOfDay();
  const week = istStartOfDay(6);
  const month = istStartOfDay(29);
  const notif = await getSetting("notifications");

  const [total, todayRev, weekRev, monthRev, statusCounts, customers, newCustomers, lowStock, expiring, unassigned, openTickets, pendingReviews, pendingPartners, bestsellers, daily, categoryShare, paymentSplit] =
    await Promise.all([
      revenueSince(), revenueSince(today), revenueSince(week), revenueSince(month),
      prisma.order.groupBy({ by: ["status"], _count: true }),
      prisma.user.count({ where: { role: { key: "CUSTOMER" }, status: { not: "DELETED" } } }),
      prisma.user.count({ where: { role: { key: "CUSTOMER" }, createdAt: { gte: month } } }),
      prisma.$queryRaw<{ variantId: string; productName: string; label: string; available: number; threshold: number }[]>`
        SELECT i."variantId", p."name" AS "productName", v."label", i."available", i."lowStockThreshold" AS threshold
        FROM "Inventory" i JOIN "ProductVariant" v ON v."id" = i."variantId" JOIN "Product" p ON p."id" = v."productId"
        WHERE v."isActive" AND p."isActive" AND p."deletedAt" IS NULL AND i."available" <= i."lowStockThreshold"
        ORDER BY i."available" ASC LIMIT 10`,
      prisma.inventoryBatch.findMany({
        where: { status: "ACTIVE", remaining: { gt: 0 }, expiresAt: { lte: new Date(Date.now() + notif.expiryAlertDays * 86_400_000) } },
        include: { variant: { include: { product: { select: { name: true } } } } }, orderBy: { expiresAt: "asc" }, take: 10,
      }),
      prisma.order.count({ where: { status: { in: ["PACKED", "READY_FOR_PICKUP"] }, assignments: { none: { status: { in: ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } } } } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.review.count({ where: { status: "PENDING" } }),
      prisma.deliveryPartner.count({ where: { status: "PENDING" } }),
      prisma.$queryRaw<{ productId: string; name: string; quantity: bigint; revenue: bigint }[]>`
        SELECT oi."productId", oi."productName" AS name, SUM(oi."quantity") AS quantity, SUM(oi."lineTotalPaise") AS revenue
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."status" <> 'CANCELLED' AND o."createdAt" >= ${month}
        GROUP BY oi."productId", oi."productName" ORDER BY quantity DESC LIMIT 8`,
      prisma.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
        SELECT date_trunc('day', o."createdAt" AT TIME ZONE 'Asia/Kolkata') AS day,
          COALESCE(SUM(CASE WHEN o."paymentStatus"::text IN ${REVENUE_STATUSES} THEN o."totalPaise" - o."refundedPaise" ELSE 0 END), 0) AS revenue,
          COUNT(*) FILTER (WHERE o."status" <> 'CANCELLED') AS orders
        FROM "Order" o WHERE o."createdAt" >= ${month} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ category: string; revenue: bigint }[]>`
        SELECT c."name" AS category, SUM(oi."lineTotalPaise") AS revenue FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId" JOIN "Product" p ON p."id" = oi."productId" JOIN "Category" c ON c."id" = p."categoryId"
        WHERE o."status" <> 'CANCELLED' AND o."createdAt" >= ${month} GROUP BY c."name" ORDER BY revenue DESC LIMIT 8`,
      prisma.order.groupBy({ by: ["paymentMethod"], where: { status: { not: "CANCELLED" }, createdAt: { gte: month } }, _count: true, _sum: { totalPaise: true } }),
    ]);

  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count])) as Record<string, number>;
  const sum = (keys: string[]) => keys.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const totalOrders = Object.values(counts).reduce((a, b) => a + b, 0);

  // Fill missing days for a continuous chart.
  const series: { date: string; revenuePaise: number; orders: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(istStartOfDay(i).getTime() + 330 * 60_000).toISOString().slice(0, 10);
    const row = daily.find((r) => new Date(r.day).toISOString().slice(0, 10) === d);
    series.push({ date: d, revenuePaise: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) });
  }

  res.json({
    revenue: canMoney
      ? { totalPaise: total.revenuePaise, todayPaise: todayRev.revenuePaise, weekPaise: weekRev.revenuePaise, monthPaise: monthRev.revenuePaise, averageOrderValuePaise: total.orders ? Math.round(total.revenuePaise / total.orders) : 0 }
      : null,
    orders: {
      total: totalOrders,
      pending: sum(["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"]),
      kitchen: sum(["CONFIRMED", "PROCESSING", "PREPARING"]),
      delivered: sum(["DELIVERED"]),
      cancelled: sum(["CANCELLED"]),
      refunds: sum(["REFUND_INITIATED", "REFUNDED"]),
      today: todayRev.orders,
      byStatus: counts,
      unassigned,
    },
    customers: { total: customers, newLast30Days: newCustomers },
    attention: { openTickets, pendingReviews, pendingPartners },
    lowStock: lowStock.map((l) => ({ ...l, available: Number(l.available), threshold: Number(l.threshold) })),
    expiring: expiring.map((b) => ({ batchId: b.id, batchNumber: b.batchNumber, product: b.variant.product.name, variant: b.variant.label, remaining: b.remaining, expiresAt: b.expiresAt })),
    bestsellers: bestsellers.map((b) => ({ productId: b.productId, name: b.name, quantity: Number(b.quantity), revenuePaise: canMoney ? Number(b.revenue) : null })),
    charts: canMoney
      ? {
          daily: series,
          categoryShare: categoryShare.map((c) => ({ category: c.category, revenuePaise: Number(c.revenue) })),
          paymentSplit: paymentSplit.map((p) => ({ method: p.paymentMethod, orders: p._count, amountPaise: p._sum.totalPaise ?? 0 })),
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
  const rupees = (p: number | bigint | null) => (Number(p ?? 0) / 100).toFixed(2);
  switch (type) {
    case "sales": {
      const rows = await prisma.$queryRaw<{ day: Date; orders: bigint; gross: bigint; discounts: bigint; delivery: bigint; tax: bigint; refunds: bigint; net: bigint }[]>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS day, COUNT(*) AS orders, SUM("subtotalPaise") AS gross,
          SUM("couponDiscountPaise" + "loyaltyDiscountPaise") AS discounts, SUM("deliveryFeePaise") AS delivery, SUM("taxPaise") AS tax,
          SUM("refundedPaise") AS refunds, SUM("totalPaise" - "refundedPaise") AS net
        FROM "Order" WHERE "paymentStatus"::text IN ${REVENUE_STATUSES} AND "createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ date: new Date(r.day).toISOString().slice(0, 10), orders: Number(r.orders), gross_sales: rupees(r.gross), discounts: rupees(r.discounts), delivery_fees: rupees(r.delivery), gst: rupees(r.tax), refunds: rupees(r.refunds), net_revenue: rupees(r.net) }));
    }
    case "orders": {
      const rows = await prisma.order.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "asc" }, include: { items: true } });
      return rows.map((o) => ({ order_number: o.orderNumber, invoice_number: o.invoiceNumber ?? "", date: o.createdAt, status: o.status, payment_method: o.paymentMethod, payment_status: o.paymentStatus, customer: o.customerName, pincode: o.deliveryPincode, items: o.items.reduce((s, i) => s + i.quantity, 0), subtotal: rupees(o.subtotalPaise), discount: rupees(o.couponDiscountPaise + o.loyaltyDiscountPaise), delivery_fee: rupees(o.deliveryFeePaise), gst: rupees(o.taxPaise), total: rupees(o.totalPaise), refunded: rupees(o.refundedPaise), coupon: o.couponCode ?? "" }));
    }
    case "products": {
      const rows = await prisma.$queryRaw<{ name: string; sku: string; variant: string; quantity: bigint; revenue: bigint; orders: bigint }[]>`
        SELECT oi."productName" AS name, oi."sku", oi."variantLabel" AS variant, SUM(oi."quantity") AS quantity, SUM(oi."lineTotalPaise") AS revenue, COUNT(DISTINCT oi."orderId") AS orders
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId" WHERE o."status" <> 'CANCELLED' AND o."createdAt" BETWEEN ${from} AND ${to}
        GROUP BY 1, 2, 3 ORDER BY quantity DESC`;
      return rows.map((r) => ({ product: r.name, variant: r.variant, sku: r.sku, units_sold: Number(r.quantity), orders: Number(r.orders), revenue: rupees(r.revenue) }));
    }
    case "inventory": {
      const rows = await prisma.productVariant.findMany({ where: { product: { deletedAt: null } }, include: { inventory: true, product: true, batches: { where: { status: "ACTIVE" }, orderBy: { expiresAt: "asc" } } }, orderBy: { product: { name: "asc" } } });
      return rows.map((v) => ({ product: v.product.name, variant: v.label, sku: v.sku, available: v.inventory?.available ?? 0, reserved: v.inventory?.reserved ?? 0, low_stock_threshold: v.inventory?.lowStockThreshold ?? 0, active_batches: v.batches.length, next_expiry: v.batches[0]?.expiresAt ?? "", stock_value_at_cost: rupees(v.batches.reduce((s, b) => s + b.remaining * b.costPricePaise, 0)) }));
    }
    case "customers": {
      const rows = await prisma.$queryRaw<{ name: string; email: string | null; phone: string | null; joined: Date; orders: bigint; spend: bigint | null; last_order: Date | null }[]>`
        SELECT u."name", u."email", u."phone", u."createdAt" AS joined, COUNT(o."id") AS orders, SUM(o."totalPaise" - o."refundedPaise") FILTER (WHERE o."paymentStatus"::text IN ${REVENUE_STATUSES}) AS spend, MAX(o."createdAt") AS last_order
        FROM "User" u JOIN "Role" r ON r."id" = u."roleId" LEFT JOIN "Order" o ON o."userId" = u."id"
        WHERE r."key" = 'CUSTOMER' AND u."status" <> 'DELETED' AND u."createdAt" <= ${to} GROUP BY u."id" ORDER BY spend DESC NULLS LAST`;
      return rows.map((r) => ({ name: r.name, email: r.email ?? "", phone: r.phone ?? "", joined: r.joined, orders: Number(r.orders), lifetime_spend: rupees(r.spend), last_order: r.last_order ?? "" }));
    }
    case "coupons": {
      const rows = await prisma.$queryRaw<{ code: string; uses: bigint; discount: bigint; revenue: bigint }[]>`
        SELECT c."code", COUNT(cu."id") AS uses, COALESCE(SUM(cu."discountPaise"), 0) AS discount, COALESCE(SUM(o."totalPaise"), 0) AS revenue
        FROM "Coupon" c LEFT JOIN "CouponUsage" cu ON cu."couponId" = c."id" AND cu."createdAt" BETWEEN ${from} AND ${to}
        LEFT JOIN "Order" o ON o."id" = cu."orderId" GROUP BY c."code" ORDER BY uses DESC`;
      return rows.map((r) => ({ code: r.code, uses: Number(r.uses), total_discount: rupees(r.discount), order_value: rupees(r.revenue) }));
    }
    case "delivery": {
      const rows = await prisma.$queryRaw<{ name: string; phone: string | null; delivered: bigint; rejected: bigint; avg_minutes: number | null; earnings: bigint | null }[]>`
        SELECT u."name", u."phone",
          COUNT(*) FILTER (WHERE a."status" = 'DELIVERED') AS delivered,
          COUNT(*) FILTER (WHERE a."status" IN ('REJECTED','EXPIRED')) AS rejected,
          AVG(EXTRACT(EPOCH FROM (a."deliveredAt" - a."pickedUpAt")) / 60) FILTER (WHERE a."status" = 'DELIVERED') AS avg_minutes,
          (SELECT SUM(e."amountPaise") FROM "PartnerEarning" e WHERE e."partnerId" = p."id" AND e."createdAt" BETWEEN ${from} AND ${to}) AS earnings
        FROM "DeliveryPartner" p JOIN "User" u ON u."id" = p."userId" LEFT JOIN "DeliveryAssignment" a ON a."partnerId" = p."id" AND a."createdAt" BETWEEN ${from} AND ${to}
        GROUP BY p."id", u."name", u."phone" ORDER BY delivered DESC`;
      return rows.map((r) => ({ partner: r.name, phone: r.phone ?? "", delivered: Number(r.delivered), declined_or_expired: Number(r.rejected), avg_delivery_minutes: r.avg_minutes ? Number(r.avg_minutes).toFixed(1) : "", earnings: rupees(r.earnings) }));
    }
    case "gst": {
      const rows = await prisma.$queryRaw<{ rate: number; taxable: bigint; tax: bigint; lines: bigint }[]>`
        SELECT oi."gstRate" AS rate, SUM(oi."lineTotalPaise" - oi."discountPaise") AS taxable, SUM(oi."taxPaise") AS tax, COUNT(*) AS lines
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."paymentStatus"::text IN ${REVENUE_STATUSES} AND o."createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ gst_rate_percent: r.rate, line_items: Number(r.lines), value_incl_or_excl_tax: rupees(r.taxable), gst_amount: rupees(r.tax), cgst: rupees(Number(r.tax) / 2), sgst: rupees(Number(r.tax) / 2) }));
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
