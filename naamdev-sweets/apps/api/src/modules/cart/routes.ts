import { Router, type Request } from "express";
import { cartAddSchema, cartUpdateSchema, couponApplySchema } from "@naamdev/shared";
import { badRequest } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { addItem, buildCartView, clearCart, findCart, removeItem, setCoupon, updateItem } from "./service";

export const cartRouter = Router();

const uid = (req: Request) => req.auth?.user.id ?? null;

cartRouter.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ cart: await buildCartView(await findCart(req, false), uid(req)) });
});

cartRouter.post("/items", async (req, res) => {
  const { variantId, quantity } = body(req, cartAddSchema);
  const cart = (await findCart(req, true, res))!;
  await addItem(cart, variantId, quantity);
  res.status(201).json({ cart: await buildCartView(cart, uid(req)) });
});

cartRouter.patch("/items/:id", async (req, res) => {
  const patch = body(req, cartUpdateSchema);
  const cart = await findCart(req, false);
  if (!cart) throw badRequest("Your cart is empty");
  await updateItem(cart, param(req, "id"), patch);
  res.json({ cart: await buildCartView(cart, uid(req)) });
});

cartRouter.delete("/items/:id", async (req, res) => {
  const cart = await findCart(req, false);
  if (cart) await removeItem(cart, param(req, "id"));
  res.json({ cart: await buildCartView(cart, uid(req)) });
});

cartRouter.delete("/", async (req, res) => {
  const cart = await findCart(req, false);
  if (cart) await clearCart(cart);
  res.json({ cart: await buildCartView(cart, uid(req)) });
});

cartRouter.post("/coupon", async (req, res) => {
  const { code } = body(req, couponApplySchema);
  const cart = await findCart(req, false);
  if (!cart) throw badRequest("Add items to your cart before applying a coupon.");
  const preview = await buildCartView(cart, uid(req), { couponCode: code });
  const ev = preview.pricing.coupon?.evaluation;
  if (!ev || !ev.valid) throw badRequest(ev && !ev.valid ? ev.message : "Invalid coupon", { reason: ev && !ev.valid ? ev.reason : "NOT_FOUND" }, "COUPON_INVALID");
  await setCoupon(cart, code);
  res.json({ cart: preview });
});

cartRouter.delete("/coupon", async (req, res) => {
  const cart = await findCart(req, false);
  if (cart) await setCoupon(cart, null);
  res.json({ cart: await buildCartView(cart, uid(req)) });
});
