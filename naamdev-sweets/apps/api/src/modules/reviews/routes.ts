import { Router } from "express";
import { prisma } from "@naamdev/db";
import { reviewSchema } from "@naamdev/shared";
import { badRequest, notFound } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { notifyStaff } from "../notifications/service";

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

reviewsRouter.get("/mine", async (req, res) => {
  const reviews = await prisma.review.findMany({ where: { userId: req.auth!.user.id }, include: { product: { select: { name: true, slug: true, images: { take: 1 } } } }, orderBy: { createdAt: "desc" } });
  res.json({ reviews });
});

/** Only verified buyers (a delivered order containing the product) may review. */
reviewsRouter.post("/", async (req, res) => {
  const input = body(req, reviewSchema);
  const uid = req.auth!.user.id;
  const order = await prisma.order.findFirst({ where: { userId: uid, status: { in: ["DELIVERED", "REFUND_INITIATED", "REFUNDED"] }, items: { some: { productId: input.productId } } }, orderBy: { deliveredAt: "desc" } });
  if (!order) throw badRequest("You can review products after they are delivered to you.", undefined, "NOT_VERIFIED_BUYER");
  const review = await prisma.review.upsert({
    where: { userId_productId: { userId: uid, productId: input.productId } },
    update: { rating: input.rating, title: input.title, body: input.body, status: "PENDING", moderatedAt: null, orderId: order.id },
    create: { ...input, userId: uid, orderId: order.id },
  });
  notifyStaff("reviews.moderate", { type: "SYSTEM", title: "New review awaiting moderation", body: `${input.rating}★ ${input.title ?? ""}`.trim(), link: "/reviews", template: "admin.review" });
  res.status(201).json({ review });
});

reviewsRouter.delete("/:id", async (req, res) => {
  const r = await prisma.review.findFirst({ where: { id: param(req, "id"), userId: req.auth!.user.id } });
  if (!r) throw notFound("Review");
  await prisma.review.delete({ where: { id: r.id } });
  if (r.status === "APPROVED") await recomputeRating(r.productId);
  res.json({ ok: true });
});

export async function recomputeRating(productId: string) {
  const agg = await prisma.review.aggregate({ where: { productId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
  await prisma.product.update({ where: { id: productId }, data: { avgRating: agg._avg.rating ?? 0, reviewCount: agg._count } });
}
