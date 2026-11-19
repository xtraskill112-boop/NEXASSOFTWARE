import { Router } from "express";
import { C, db, getDoc, getDocs, type Order, type Review } from "@naamdev/db";
import { reviewSchema } from "@naamdev/shared";
import { badRequest, notFound } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { bumpCatalog, catalog } from "../catalog/cache";
import { sortedImages } from "../catalog/serializers";
import { notifyStaff } from "../notifications/service";

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

const reviewId = (userId: string, productId: string) => `${userId}_${productId}`;

reviewsRouter.get("/mine", async (req, res) => {
  const snap = await catalog();
  const reviews = (await getDocs<Review>(db.collection(C.reviews).where("userId", "==", req.auth!.user.id))).sort((a, b) => +b.createdAt - +a.createdAt);
  res.json({
    reviews: reviews.map((r) => {
      const p = snap.byId.get(r.productId);
      return { ...r, product: p ? { name: p.name, slug: p.slug, images: sortedImages(p).slice(0, 1) } : null };
    }),
  });
});

/** Only verified buyers (a delivered order containing the product) may review. */
reviewsRouter.post("/", async (req, res) => {
  const input = body(req, reviewSchema);
  const uid = req.auth!.user.id;
  const orders = await getDocs<Order>(db.collection(C.orders).where("productIds", "array-contains", input.productId).where("userId", "==", uid));
  const order = orders.filter((o) => ["DELIVERED", "REFUND_INITIATED", "REFUNDED"].includes(o.status)).sort((a, b) => +(b.deliveredAt ?? 0) - +(a.deliveredAt ?? 0))[0];
  if (!order) throw badRequest("You can review products after they are delivered to you.", undefined, "NOT_VERIFIED_BUYER");
  const ref = db.collection(C.reviews).doc(reviewId(uid, input.productId));
  const existing = await getDoc<Review>(ref);
  const now = new Date();
  const review: Review = {
    productId: input.productId, userId: uid, userName: req.auth!.user.name, orderId: order.id, rating: input.rating, title: input.title ?? null,
    body: input.body ?? null, status: "PENDING", moderatedById: null, moderatedAt: null, rejectionReason: null, createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  await ref.set(review);
  if (existing?.status === "APPROVED") await recomputeRating(input.productId);
  notifyStaff("reviews.moderate", { type: "SYSTEM", title: "New review awaiting moderation", body: `${input.rating}★ ${input.title ?? ""}`.trim(), link: "/reviews", template: "admin.review" });
  res.status(201).json({ review: { ...review, id: ref.id } });
});

reviewsRouter.delete("/:id", async (req, res) => {
  const r = await getDoc<Review>(db.collection(C.reviews).doc(param(req, "id")));
  if (!r || r.userId !== req.auth!.user.id) throw notFound("Review");
  await db.collection(C.reviews).doc(r.id).delete();
  if (r.status === "APPROVED") await recomputeRating(r.productId);
  res.json({ ok: true });
});

export async function recomputeRating(productId: string) {
  const approved = await getDocs<Review>(db.collection(C.reviews).where("productId", "==", productId).where("status", "==", "APPROVED"));
  const avg = approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0;
  await db.collection(C.products).doc(productId).update({ avgRating: avg, reviewCount: approved.length });
  bumpCatalog("products");
}
