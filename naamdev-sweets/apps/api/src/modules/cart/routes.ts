import { Router } from "express";
import { prisma } from "@naamdev/db";
import { cartAddSchema, cartUpdateSchema, couponApplySchema } from "@naamdev/shared";
import { badRequest } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { addItem, buildCartView, findCart, updateItem } from "./service";

export const cartRouter = Router();

const view = async (req: Parameters<typeof findCart>[0]) => {
  const cart = await findCart(req, false);
  return buildCartView(cart?.id ?? null, req.auth?.user.id ?? null);
};

cartRouter.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ cart: await view(req) });
});

cartRouter.post("/items", async (req, res) => {
  const { variantId, quantity } = body(req, cartAddSchema);
  const cart = (await findCart(req, true, res))!;
  await addItem(cart.id, variantId, quantity);
  res.status(201).json({ cart: await buildCartView(cart.id, req.auth?.user.id ?? null) });
});

cartRouter.patch("/items/:id", async (req, res) => {
  const patch = body(req, cartUpdateSchema);
  const cart = await findCart(req, false);
  if (!cart) throw badRequest("Your cart is empty");
  await updateItem(cart.id, param(req, "id"), patch);
  res.json({ cart: await buildCartView(cart.id, req.auth?.user.id ?? null) });
});

cartRouter.delete("/items/:id", async (req, res) => {
  const cart = await findCart(req, false);
  if (cart) await prisma.cartItem.deleteMany({ where: { id: param(req, "id"), cartId: cart.id } });
  res.json({ cart: await buildCartView(cart?.id ?? null, req.auth?.user.id ?? null) });
});

cartRouter.delete("/", async (req, res) => {
  const cart = await findCart(req, false);
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false } });
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  }
  res.json({ cart: await buildCartView(cart?.id ?? null, req.auth?.user.id ?? null) });
});

cartRouter.post("/coupon", async (req, res) => {
  const { code } = body(req, couponApplySchema);
  const cart = await findCart(req, false);
  if (!cart) throw badRequest("Add items to your cart before applying a coupon.");
  const preview = await buildCartView(cart.id, req.auth?.user.id ?? null, { couponCode: code });
  const ev = preview.pricing.coupon?.evaluation;
  if (!ev || !ev.valid) throw badRequest(ev && !ev.valid ? ev.message : "Invalid coupon", { reason: ev && !ev.valid ? ev.reason : "NOT_FOUND" }, "COUPON_INVALID");
  await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
  res.json({ cart: preview });
});

cartRouter.delete("/coupon", async (req, res) => {
  const cart = await findCart(req, false);
  if (cart) await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  res.json({ cart: await buildCartView(cart?.id ?? null, req.auth?.user.id ?? null) });
});
