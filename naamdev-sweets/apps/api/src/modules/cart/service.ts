import type { Request, Response } from "express";
import { C, db, getDoc, getDocs, newId, type Cart, type CartItem, type Coupon, type CouponUsage, type Inventory, type Order, type User, type WithId } from "@naamdev/db";
import { priceCart, sellingPrice, type CouponRule, type PricingResult } from "@naamdev/shared";
import { randomToken } from "../../lib/crypto";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { getSetting } from "../../lib/settings";
import { catalog } from "../catalog/cache";
import { activeVariants, sortedImages } from "../catalog/serializers";

/** Guest carts are identified by a random token the browser keeps and sends in this header. */
export const CART_TOKEN_HEADER = "x-cart-token";
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

const cartRef = (id: string) => db.collection(C.carts).doc(id);
const userCartId = (uid: string) => `u_${uid}`;
const guestToken = (req: Request) => {
  const t = req.get(CART_TOKEN_HEADER);
  return t && TOKEN_RE.test(t) ? t : null;
};

function emptyCart(userId: string | null, token: string | null): Cart {
  const now = new Date();
  return { userId, guestToken: token, couponCode: null, items: [], createdAt: now, updatedAt: now };
}

export async function findCart(req: Request, create: boolean, res?: Response): Promise<WithId<Cart> | null> {
  if (req.auth) {
    const id = userCartId(req.auth.user.id);
    const existing = await getDoc<Cart>(cartRef(id));
    if (existing || !create) return existing;
    const cart = emptyCart(req.auth.user.id, null);
    await cartRef(id).set(cart);
    return { ...cart, id };
  }
  const token = guestToken(req);
  if (token) {
    const cart = await getDoc<Cart>(cartRef(`g_${token}`));
    if (cart) return cart;
  }
  if (!create || !res) return null;
  const fresh = randomToken(24);
  const cart = emptyCart(null, fresh);
  await cartRef(`g_${fresh}`).set(cart);
  res.set(CART_TOKEN_HEADER, fresh);
  return { ...cart, id: `g_${fresh}` };
}

/** On sign-in, guest cart lines are merged into the user's cart (quantities summed, capped by stock). */
export async function mergeGuestCart(req: Request, res: Response, userId: string) {
  const token = guestToken(req);
  if (!token) return;
  const guest = await getDoc<Cart>(cartRef(`g_${token}`));
  res.set(CART_TOKEN_HEADER, "");
  if (!guest) return;
  const [checkout, snap] = await Promise.all([getSetting("checkout"), catalog()]);
  await db.runTransaction(async (tx) => {
    const ref = cartRef(userCartId(userId));
    const userCart = (await getDoc<Cart>(ref, tx)) ?? { ...emptyCart(userId, null), id: ref.id };
    const items = [...userCart.items];
    for (const item of guest.items) {
      const existing = items.find((i) => i.variantId === item.variantId);
      const cap = Math.min(checkout.maxQtyPerItem, Math.max(1, snap.stock.get(item.variantId)?.available ?? 1));
      const quantity = Math.min(cap, (existing?.quantity ?? 0) + item.quantity);
      if (existing) Object.assign(existing, { quantity, savedForLater: existing.savedForLater && item.savedForLater, updatedAt: new Date() });
      else items.push({ ...item, quantity });
    }
    const { id: _id, ...data } = userCart;
    tx.set(ref, { ...data, items, couponCode: userCart.couponCode ?? guest.couponCode, updatedAt: new Date() });
    tx.delete(cartRef(guest.id));
  });
}

async function serializeItems(items: CartItem[]) {
  const snap = await catalog();
  return [...items]
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((i) => {
      const hit = snap.variants.get(i.variantId);
      const issues: string[] = [];
      if (!hit) return null;
      const { product: p, variant: v } = hit;
      const available = snap.stock.get(v.id)?.available ?? 0;
      const category = snap.categoryById.get(p.categoryId);
      if (!v.isActive || !p.isActive || p.deletedAt) issues.push("UNAVAILABLE");
      else if (available <= 0) issues.push("OUT_OF_STOCK");
      else if (i.quantity > available) issues.push("INSUFFICIENT_STOCK");
      return {
        id: i.id,
        quantity: i.quantity,
        savedForLater: i.savedForLater,
        variant: {
          id: v.id, label: v.label, sku: v.sku, mrpPaise: v.mrpPaise, salePricePaise: v.salePricePaise, pricePaise: sellingPrice(v),
          available: Math.min(available, 50), inStock: available > 0,
        },
        product: {
          id: p.id, slug: p.slug, name: p.name, nameHi: p.nameHi, image: sortedImages(p)[0]?.url ?? null, foodType: p.foodType,
          category: { slug: category?.slug ?? "", name: category?.name ?? "" },
          variants: activeVariants(p).map((pv) => ({ id: pv.id, label: pv.label, pricePaise: sellingPrice(pv), mrpPaise: pv.mrpPaise, inStock: (snap.stock.get(pv.id)?.available ?? 0) > 0 })),
        },
        lineTotalPaise: sellingPrice(v) * i.quantity,
        issues,
        /** Internal: used for pricing (GST) — not part of the public shape. */
        _gstRate: p.gstRate ?? category?.gstRate ?? null,
        _categoryId: p.categoryId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export type SerializedCartItem = Omit<Awaited<ReturnType<typeof serializeItems>>[number], "_gstRate" | "_categoryId">;

export function couponRule(c: WithId<Coupon>): CouponRule {
  return {
    code: c.code, type: c.type, scope: c.scope, value: c.value, maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise,
    startsAt: c.startsAt, endsAt: c.endsAt, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, usedCount: c.usedCount,
    firstOrderOnly: c.firstOrderOnly, isActive: c.isActive, productIds: c.productIds, categoryIds: c.categoryIds,
  };
}

export async function couponForCode(code: string | null | undefined) {
  if (!code) return null;
  const c = await getDoc<Coupon>(db.collection(C.coupons).doc(code.toUpperCase()));
  if (!c) return null;
  return { coupon: c, rule: couponRule(c) };
}

/** Orders that count for "first order" rules: anything except cancelled and unpaid online orders. */
export const countsAsOrder = (o: Pick<Order, "status" | "paymentMethod">) => o.status !== "CANCELLED" && !(o.status === "PENDING" && o.paymentMethod !== "COD");

export async function couponContextFor(userId: string | null, couponCode: string | null) {
  if (!userId) return { customerOrderCount: 0, customerUsageCount: 0, isAuthenticated: false };
  const [orders, usage] = await Promise.all([
    getDocs<Order>(db.collection(C.orders).where("userId", "==", userId).select("status", "paymentMethod").limit(50)),
    couponCode ? getDocs<CouponUsage>(db.collection(C.couponUsages).where("userId", "==", userId).where("couponCode", "==", couponCode)) : [],
  ]);
  return { customerOrderCount: orders.filter(countsAsOrder).length, customerUsageCount: usage.length, isAuthenticated: true };
}

export interface CartView {
  id: string | null;
  items: SerializedCartItem[];
  savedItems: SerializedCartItem[];
  couponCode: string | null;
  pricing: PricingResult;
  canCheckout: boolean;
  blockers: string[];
}

export async function buildCartView(
  cart: WithId<Cart> | null,
  userId: string | null,
  opts: { couponCode?: string | null; redeemPoints?: number; zoneDeliveryFeePaise?: number | null } = {},
): Promise<CartView> {
  const [checkout, loyalty] = await Promise.all([getSetting("checkout"), getSetting("loyalty")]);
  const all = await serializeItems(cart?.items ?? []);
  const items = all.filter((i) => !i.savedForLater);
  const savedItems = all.filter((i) => i.savedForLater);
  const purchasable = items.filter((i) => i.issues.length === 0);

  const code = opts.couponCode !== undefined ? opts.couponCode : (cart?.couponCode ?? null);
  const found = await couponForCode(code);
  const user = userId ? await getDoc<User>(db.collection(C.users).doc(userId)) : null;

  const pricing = priceCart({
    lines: purchasable.map((i) => ({
      variantId: i.variant.id, productId: i.product.id, categoryId: i._categoryId, quantity: i.quantity,
      unitMrpPaise: i.variant.mrpPaise, unitPricePaise: i.variant.pricePaise, gstRate: i._gstRate ?? checkout.defaultGstRate,
    })),
    checkout,
    loyalty,
    zoneDeliveryFeePaise: opts.zoneDeliveryFeePaise,
    coupon: found?.rule ?? null,
    couponContext: await couponContextFor(userId, found?.coupon.code ?? null),
    redeemPoints: opts.redeemPoints ?? 0,
    pointsBalance: user?.loyaltyPoints ?? 0,
  });
  if (code && !found) pricing.coupon = { code, evaluation: { valid: false, reason: "NOT_APPLICABLE", message: "This coupon code doesn't exist." } };

  const blockers: string[] = [];
  if (!items.length) blockers.push("Your cart is empty.");
  if (items.some((i) => i.issues.length)) blockers.push("Some items are unavailable or exceed available stock. Please update your cart.");
  if (!pricing.meetsMinimumOrder && items.length) blockers.push(`Minimum order value is ₹${(pricing.minOrderPaise / 100).toFixed(0)}.`);

  const strip = ({ _gstRate: _g, _categoryId: _c, ...rest }: (typeof all)[number]) => rest;
  return { id: cart?.id ?? null, items: items.map(strip), savedItems: savedItems.map(strip), couponCode: code ?? null, pricing, canCheckout: blockers.length === 0, blockers };
}

/** Validates a variant can be bought in this quantity against live (not cached) stock. */
export async function assertPurchasable(variantId: string, quantity: number) {
  const snap = await catalog();
  const hit = snap.variants.get(variantId);
  if (!hit || !hit.variant.isActive || !hit.product.isActive || hit.product.deletedAt) throw notFound("Product");
  const checkout = await getSetting("checkout");
  if (quantity > checkout.maxQtyPerItem) throw badRequest(`You can order up to ${checkout.maxQtyPerItem} of an item.`);
  const inv = await getDoc<Inventory>(db.collection(C.inventory).doc(variantId));
  const available = inv?.available ?? 0;
  if (available <= 0) throw conflict("This item just went out of stock.", { available: 0 }, "OUT_OF_STOCK");
  if (quantity > available) throw conflict(`Only ${available} left in stock.`, { available }, "INSUFFICIENT_STOCK");
  return hit;
}

async function saveItems(cart: WithId<Cart>, items: CartItem[], extra: Partial<Cart> = {}) {
  cart.items = items;
  Object.assign(cart, extra);
  await cartRef(cart.id).update({ items, ...extra, updatedAt: new Date() });
}

export async function addItem(cart: WithId<Cart>, variantId: string, quantity: number) {
  const existing = cart.items.find((i) => i.variantId === variantId);
  const next = (existing && !existing.savedForLater ? existing.quantity : 0) + quantity;
  const { product } = await assertPurchasable(variantId, next);
  const now = new Date();
  const items = existing
    ? cart.items.map((i) => (i === existing ? { ...i, quantity: next, savedForLater: false, updatedAt: now } : i))
    : [...cart.items, { id: newId(), variantId, productId: product.id, quantity: next, savedForLater: false, createdAt: now, updatedAt: now }];
  await saveItems(cart, items);
}

export async function updateItem(cart: WithId<Cart>, itemId: string, patch: { quantity?: number; variantId?: string; savedForLater?: boolean }) {
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw notFound("Cart item");
  if (patch.quantity === 0) return saveItems(cart, cart.items.filter((i) => i.id !== itemId));
  const now = new Date();

  if (patch.variantId && patch.variantId !== item.variantId) {
    const snap = await catalog();
    const target = snap.variants.get(patch.variantId);
    const current = snap.variants.get(item.variantId);
    if (!target || target.product.id !== current?.product.id) throw badRequest("Choose a weight option of the same product.");
    const qty = patch.quantity ?? item.quantity;
    await assertPurchasable(target.variant.id, qty);
    const clash = cart.items.find((i) => i.variantId === target.variant.id);
    if (clash) {
      const max = (await getSetting("checkout")).maxQtyPerItem;
      return saveItems(
        cart,
        cart.items.filter((i) => i.id !== item.id).map((i) => (i === clash ? { ...i, quantity: Math.min(qty + clash.quantity, max), savedForLater: false, updatedAt: now } : i)),
      );
    }
    return saveItems(cart, cart.items.map((i) => (i === item ? { ...i, variantId: target.variant.id, quantity: qty, updatedAt: now } : i)));
  }
  const quantity = patch.quantity ?? item.quantity;
  const savedForLater = patch.savedForLater ?? item.savedForLater;
  if (!savedForLater && (patch.quantity !== undefined || patch.savedForLater === false)) await assertPurchasable(item.variantId, quantity);
  return saveItems(cart, cart.items.map((i) => (i === item ? { ...i, quantity, savedForLater, updatedAt: now } : i)));
}

export async function removeItem(cart: WithId<Cart>, itemId: string) {
  await saveItems(cart, cart.items.filter((i) => i.id !== itemId));
}

export async function clearCart(cart: WithId<Cart>) {
  await saveItems(cart, cart.items.filter((i) => i.savedForLater), { couponCode: null });
}

export async function setCoupon(cart: WithId<Cart>, code: string | null) {
  cart.couponCode = code;
  await cartRef(cart.id).update({ couponCode: code, updatedAt: new Date() });
}
