import { Router } from "express";
import { z } from "zod";
import { C, db } from "@naamdev/db";
import { normalizeIndianPhone } from "@naamdev/shared";
import { badRequest, forbidden, unauthorized } from "../../lib/errors";
import { body } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rate-limit";
import { mergeGuestCart } from "../cart/service";
import { assertAppAccess, currentUserPayload, registerCustomer, revokeAllSessions } from "./service";

/**
 * Sign-in, sign-up, email verification and password reset happen in the browser with Firebase
 * Authentication (email + password). These endpoints link the Firebase account to the NAAMDEV profile.
 */
export const authRouter = Router();

authRouter.get("/me", async (req, res) => {
  if (req.auth) return res.json({ user: await currentUserPayload(req.auth.user.id) });
  if (req.firebaseUser) return res.json({ user: null, needsProfile: true, email: req.firebaseUser.email });
  res.json({ user: null });
});

/** Called right after a Firebase sign-in: checks this app may be used and merges the guest cart. */
authRouter.post("/session", authLimiter, async (req, res) => {
  if (req.auth) {
    await assertAppAccess(req.auth.user, req.clientApp);
    await db.collection(C.users).doc(req.auth.user.id).update({ lastLoginAt: new Date() });
    if (req.clientApp === "web") await mergeGuestCart(req, res, req.auth.user.id);
    return res.json({ user: await currentUserPayload(req.auth.user.id) });
  }
  if (req.firebaseUser) {
    if (req.clientApp === "admin") throw forbidden("This console is for NAAMDEV staff only.");
    return res.json({ user: null, needsProfile: true, email: req.firebaseUser.email });
  }
  throw unauthorized("Please log in to continue");
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v, ctx) => {
      if (!v) return null;
      const p = normalizeIndianPhone(v);
      if (!p) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number" });
      return p;
    }),
  referralCode: z.string().trim().toUpperCase().max(20).optional().or(z.literal("").transform(() => undefined)),
});

/** Completes storefront sign-up: creates the customer profile for the signed-in Firebase account. */
authRouter.post("/register", authLimiter, async (req, res) => {
  if (req.clientApp !== "web") throw badRequest("Use the partner registration flow in the delivery app.");
  if (req.auth) return res.json({ user: await currentUserPayload(req.auth.user.id) });
  if (!req.firebaseUser) throw unauthorized("Create your account first, then complete your profile.");
  const input = body(req, registerSchema);
  const fb = req.firebaseUser;
  await registerCustomer({ uid: fb.uid, email: fb.email, emailVerified: fb.emailVerified, name: input.name, phone: input.phone, referralCode: input.referralCode });
  await mergeGuestCart(req, res, fb.uid);
  res.status(201).json({ user: await currentUserPayload(fb.uid) });
});

authRouter.post("/logout", (_req, res) => {
  // Firebase signs the browser out; nothing is stored server-side per session.
  res.json({ ok: true });
});

/** Signs the account out on every device (Firebase refresh tokens revoked, older ID tokens rejected). */
authRouter.post("/sign-out-everywhere", requireAuth, async (req, res) => {
  await revokeAllSessions(req.auth!.user.id);
  res.json({ ok: true });
});
