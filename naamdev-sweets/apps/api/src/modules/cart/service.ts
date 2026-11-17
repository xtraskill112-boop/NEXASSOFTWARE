import type { Request, Response } from "express";
import { prisma, type Prisma } from "@naamdev/db";
import { priceCart, sellingPrice, type CouponRule, type PricingResult } from "@naamdev/shared";
import { randomToken } from "../../lib/crypto";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { getSetting } from "../../lib/settings";
import { cookieOptions } from "../../middleware/auth";

export const CART_COOKIE = "nds_cart";

const itemInclude = {
  variant: {
    include: {
      inventory: true,
      product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, category: true, variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { inventory: true } } } },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemFull = Prisma.CartItemGetPayload<{ include: typeof itemInclude }>;

export async function findCart(req: Request, create: boolean, res?: Response) {
  if (req.auth) {
    const userId = req.auth.user.id;
    const existing = await prisma.cart.findUnique({ where: { userId } });
    if (existing || !create) return existing;
    return prisma.cart.create({ data: { userId } });
  }
  const token = req.cookies?.[CART_COOKIE] as string | undefined;
  if (token) {
    const cart = await prisma.cart.findUnique({ where: { guestToken: token } });
    if (cart) return cart;
  }
  if (!create || !res) return null;
  const guestToken = randomToken(24);
  res.cookie(CART_COOKIE, guestToken, cookieOptions(30 * 86_400_000));
  return prisma.cart.create({ data: { guestToken } });
}

/** On login, guest cart lines are merged into the user's cart (quantities summed, capped by stock). */
export async function mergeGuestCart(req: Request, res: Response, userId: string) {
  const token = req.cookies?.[CART_COOKIE] as string | undefined;
  if (!token) return;
  const guest = await prisma.cart.findUnique({ where: { guestToken: token }, include: { items: { include: { variant: { include: { inventory: true } } } } } });
  res.clearCookie(CART_COOKIE, cookieOptions());
  if (!guest) return;
  const checkout = await getSetting("checkout");
  const userCart = (await prisma.cart.findUnique({ where: { userId } })) ?? (await prisma.cart.create({ data: { userId } }));
  for (const item of guest.items) {
    const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } } });
    const cap = Math.min(checkout.maxQtyPerItem, Math.max(1, item.variant.inventory?.available ?? 1));
    const quantity = Math.min(cap, (existing?.quantity ?? 0) + item.quantity);
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
      update: { quantity, savedForLater: existing?.savedForLater && item.savedForLater },
      create: { cartId: userCart.id, variantId: item.variantId, quantity, savedForLater: item.savedForLater },
    });
  }
  if (guest.couponCode && !userCart.couponCode) await prisma.cart.update({ where: { id: userCart.id }, data: { couponCode: guest.couponCode } });
  await prisma.cart.delete({ where: { id: guest.id } });
}

function serializeItem(i: CartItemFull) {
  const v = i.variant;
  const p = v.product;
  const available = v.inventory?.available ?? 0;
  const issues: string[] = [];
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
      id: p.id, slug: p.slug, name: p.name, nameHi: p.nameHi, image: p.images[0]?.url ?? null, foodType: p.foodType,
      category: { slug: p.category.slug, name: p.category.name },
      variants: p.variants.map((pv) => ({ id: pv.id, label: pv.label, pricePaise: sellingPrice(pv), mrpPaise: pv.mrpPaise, inStock: (pv.inventory?.available ?? 0) > 0 })),
    },
    lineTotalPaise: sellingPrice(v) * i.quantity,
    issues,
  };
}

export type SerializedCartItem = ReturnType<typeof serializeItem>;

export async function couponForCode(code: string | null | undefined) {
  if (!code) return null;
  const c = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() }, include: { products: { select: { id: true } }, categories: { select: { id: true } } } });
  if (!c) return null;
  const rule: CouponRule = {
    code: c.code, type: c.type, scope: c.scope, value: c.value, maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise,
    startsAt: c.startsAt, endsAt: c.endsAt, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, usedCount: c.usedCount,
    firstOrderOnly: c.firstOrderOnly, isActive: c.isActive, productIds: c.products.map((p) => p.id), categoryIds: c.categories.map((x) => x.id),
  };
  return { coupon: c, rule };
}

export async function couponContextFor(userId: string | null, couponId: string | null) {
  if (!userId) return { customerOrderCount: 0, customerUsageCount: 0, isAuthenticated: false };
  const [orders, usage] = await Promise.all([
    prisma.order.count({ where: { userId, status: { notIn: ["CANCELLED"] }, NOT: { status: "PENDING", paymentMethod: "ONLINE" } } }),
    couponId ? prisma.couponUsage.count({ where: { userId, couponId } }) : 0,
  ]);
  return { customerOrderCount: orders, customerUsageCount: usage, isAuthenticated: true };
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
  cartId: string | null,
  userId: string | null,
  opts: { couponCode?: string | null; redeemPoints?: number; zoneDeliveryFeePaise?: number | null } = {},
): Promise<CartView> {
  const [checkout, loyalty] = await Promise.all([getSetting("checkout"), getSetting("loyalty")]);
  const cart = cartId ? await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: itemInclude, orderBy: { createdAt: "asc" } } } }) : null;
  const all = (cart?.items ?? []).map(serializeItem);
  const items = all.filter((i) => !i.savedForLater);
  const savedItems = all.filter((i) => i.savedForLater);
  const purchasable = items.filter((i) => i.issues.length === 0);

  const code = opts.couponCode !== undefined ? opts.couponCode : (cart?.couponCode ?? null);
  const found = await couponForCode(code);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } }) : null;

  const pricing = priceCart({
    lines: purchasable.map((i) => {
      const full = cart!.items.find((c) => c.id === i.id)!;
      const gst = full.variant.product.gstRate ?? full.variant.product.category.gstRate ?? checkout.defaultGstRate;
      return { variantId: i.variant.id, productId: i.product.id, categoryId: full.variant.product.categoryId, quantity: i.quantity, unitMrpPaise: i.variant.mrpPaise, unitPricePaise: i.variant.pricePaise, gstRate: gst };
    }),
    checkout,
    loyalty,
    zoneDeliveryFeePaise: opts.zoneDeliveryFeePaise,
    coupon: found?.rule ?? null,
    couponContext: await couponContextFor(userId, found?.coupon.id ?? null),
    redeemPoints: opts.redeemPoints ?? 0,
    pointsBalance: user?.loyaltyPoints ?? 0,
  });
  if (code && !found) pricing.coupon = { code, evaluation: { valid: false, reason: "NOT_APPLICABLE", message: "This coupon code doesn't exist." } };

  const blockers: string[] = [];
  if (!items.length) blockers.push("Your cart is empty.");
  if (items.some((i) => i.issues.length)) blockers.push("Some items are unavailable or exceed available stock. Please update your cart.");
  if (!pricing.meetsMinimumOrder && items.length) blockers.push(`Minimum order value is ₹${(pricing.minOrderPaise / 100).toFixed(0)}.`);

  return { id: cart?.id ?? null, items, savedItems, couponCode: code ?? null, pricing, canCheckout: blockers.length === 0, blockers };
}

async function assertPurchasable(variantId: string, quantity: number) {
  const v = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true, inventory: true } });
  if (!v || !v.isActive || !v.product.isActive || v.product.deletedAt) throw notFound("Product");
  const checkout = await getSetting("checkout");
  if (quantity > checkout.maxQtyPerItem) throw badRequest(`You can order up to ${checkout.maxQtyPerItem} of an item.`);
  const available = v.inventory?.available ?? 0;
  if (available <= 0) throw conflict("This item just went out of stock.", { available: 0 }, "OUT_OF_STOCK");
  if (quantity > available) throw conflict(`Only ${available} left in stock.`, { available }, "INSUFFICIENT_STOCK");
  return v;
}

export async function addItem(cartId: string, variantId: string, quantity: number) {
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const next = (existing && !existing.savedForLater ? existing.quantity : 0) + quantity;
  await assertPurchasable(variantId, next);
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: next, savedForLater: false },
    create: { cartId, variantId, quantity: next },
  });
}

export async function updateItem(cartId: string, itemId: string, patch: { quantity?: number; variantId?: string; savedForLater?: boolean }) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
  if (!item) throw notFound("Cart item");
  if (patch.quantity === 0) return prisma.cartItem.delete({ where: { id: item.id } });

  if (patch.variantId && patch.variantId !== item.variantId) {
    const v = await prisma.productVariant.findUnique({ where: { id: patch.variantId } });
    const current = await prisma.productVariant.findUnique({ where: { id: item.variantId } });
    if (!v || v.productId !== current?.productId) throw badRequest("Choose a weight option of the same product.");
    const qty = patch.quantity ?? item.quantity;
    await assertPurchasable(v.id, qty);
    const clash = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId: v.id } } });
    if (clash) {
      await prisma.cartItem.update({ where: { id: clash.id }, data: { quantity: Math.min(qty + clash.quantity, (await getSetting("checkout")).maxQtyPerItem), savedForLater: false } });
      return prisma.cartItem.delete({ where: { id: item.id } });
    }
    return prisma.cartItem.update({ where: { id: item.id }, data: { variantId: v.id, quantity: qty } });
  }
  const quantity = patch.quantity ?? item.quantity;
  const savedForLater = patch.savedForLater ?? item.savedForLater;
  if (!savedForLater && (patch.quantity !== undefined || patch.savedForLater === false)) await assertPurchasable(item.variantId, quantity);
  return prisma.cartItem.update({ where: { id: item.id }, data: { quantity, savedForLater } });
}
