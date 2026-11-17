import { Router } from "express";
import { z } from "zod";
import { prisma } from "@naamdev/db";
import {
  changePasswordSchema, emailSchema, normalizeIndianPhone, otpLoginSchema, otpRequestSchema, otpSchema,
  passwordLoginSchema, passwordSchema, phoneSchema, resetPasswordSchema,
} from "@naamdev/shared";
import { badRequest, conflict, notFound, unauthorized } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { issueCsrf } from "../../middleware/csrf";
import { requireAuth } from "../../middleware/auth";
import { authLimiter, otpLimiter } from "../../middleware/rate-limit";
import { signSocketToken } from "../../realtime/socket";
import { issueOtp, verifyOtp } from "./otp";
import {
  assertAppAccess, createSession, currentUserPayload, destroySession, findUserByIdentifier, hashPassword,
  loginWithPassword, registerCustomer, revokeAllSessions, signRegistrationToken, verifyPassword, verifyRegistrationToken,
} from "./service";

export const authRouter = Router();

authRouter.get("/csrf", (req, res) => {
  res.json({ csrfToken: issueCsrf(req, res) });
});

authRouter.post("/otp/request", otpLimiter, async (req, res) => {
  const { phone, purpose } = body(req, otpRequestSchema);
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (purpose === "REGISTER" && existing) throw conflict("This mobile number is already registered. Please log in.", undefined, "ACCOUNT_EXISTS");
  // For LOGIN/RESET we always respond the same way to avoid revealing which numbers are registered.
  if (purpose === "RESET_PASSWORD" && !existing) return res.json({ sent: true, expiresInSeconds: 600 });
  const r = await issueOtp(phone, purpose, "sms");
  res.json({ sent: true, ...r });
});

authRouter.post("/otp/verify", authLimiter, async (req, res) => {
  const { phone, otp } = body(req, otpLoginSchema);
  await verifyOtp(phone, "LOGIN", otp);
  const user = await prisma.user.findUnique({ where: { phone }, include: { role: true } });
  if (!user) {
    if (req.clientApp !== "web" && req.clientApp !== "delivery") throw unauthorized("No staff account is linked to this number.");
    return res.json({ registrationRequired: true, registrationToken: signRegistrationToken(phone) });
  }
  await assertAppAccess(user, req.clientApp);
  if (!user.phoneVerifiedAt) await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
  await createSession(req, res, user.id);
  res.json({ user: await currentUserPayload(user.id) });
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema.optional().or(z.literal("").transform(() => undefined)),
    password: passwordSchema.optional().or(z.literal("").transform(() => undefined)),
    referralCode: z.string().trim().toUpperCase().max(20).optional().or(z.literal("").transform(() => undefined)),
    registrationToken: z.string().optional(),
    phone: phoneSchema.optional(),
    otp: otpSchema.optional(),
  })
  .refine((d) => d.registrationToken || (d.phone && d.otp), { message: "Verify your mobile number first" });

authRouter.post("/register", authLimiter, async (req, res) => {
  if (req.clientApp !== "web") throw badRequest("Use the partner registration flow in the delivery app.");
  const input = body(req, registerSchema);
  let phone: string;
  if (input.registrationToken) phone = verifyRegistrationToken(input.registrationToken);
  else {
    phone = input.phone!;
    await verifyOtp(phone, "REGISTER", input.otp!);
  }
  const user = await registerCustomer({ name: input.name, phone, email: input.email, password: input.password, referralCode: input.referralCode });
  await createSession(req, res, user.id);
  res.status(201).json({ user: await currentUserPayload(user.id) });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { identifier, password } = body(req, passwordLoginSchema);
  const user = await loginWithPassword(identifier, password);
  await assertAppAccess(user, req.clientApp);
  await createSession(req, res, user.id);
  res.json({ user: await currentUserPayload(user.id) });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  if (!req.auth) return res.json({ user: null });
  res.json({ user: await currentUserPayload(req.auth.user.id) });
});

authRouter.get("/socket-token", requireAuth, (req, res) => {
  const a = req.auth!;
  res.json({ token: signSocketToken({ sub: a.user.id, role: a.roleKey, staff: a.user.role.isStaff, partnerId: a.partnerId }) });
});

authRouter.post("/password/forgot", otpLimiter, async (req, res) => {
  const { identifier } = body(req, z.object({ identifier: z.string().trim().min(3).max(160) }));
  const user = await findUserByIdentifier(identifier);
  let devCode: string | undefined;
  if (user) {
    const viaEmail = identifier.includes("@");
    const target = viaEmail ? user.email! : user.phone!;
    if (target) devCode = (await issueOtp(target, "RESET_PASSWORD", viaEmail ? "email" : "sms")).devCode;
  }
  res.json({ sent: true, message: "If an account exists, we've sent a verification code.", devCode });
});

authRouter.post("/password/reset", authLimiter, async (req, res) => {
  const { identifier, otp, password } = body(req, resetPasswordSchema);
  const user = await findUserByIdentifier(identifier);
  if (!user) throw badRequest("Incorrect OTP. Please check and try again.", undefined, "OTP_INVALID");
  const target = identifier.includes("@") ? user.email! : user.phone!;
  await verifyOtp(target, "RESET_PASSWORD", otp);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await revokeAllSessions(user.id);
  res.json({ ok: true });
});

authRouter.post("/password/change", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = body(req, changePasswordSchema);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
  if (user.passwordHash && !(currentPassword && (await verifyPassword(user.passwordHash, currentPassword))))
    throw badRequest("Your current password is incorrect.", { fields: { currentPassword: "Incorrect password" } });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await revokeAllSessions(user.id, req.auth!.session?.id);
  res.json({ ok: true });
});

authRouter.post("/verify/email/request", requireAuth, otpLimiter, async (req, res) => {
  const { email } = body(req, z.object({ email: emailSchema }));
  const taken = await prisma.user.findFirst({ where: { email, id: { not: req.auth!.user.id } } });
  if (taken) throw conflict("This email is already in use by another account.");
  res.json({ sent: true, ...(await issueOtp(email, "VERIFY_EMAIL", "email")) });
});

authRouter.post("/verify/email/confirm", requireAuth, authLimiter, async (req, res) => {
  const { email, otp } = body(req, z.object({ email: emailSchema, otp: otpSchema }));
  await verifyOtp(email, "VERIFY_EMAIL", otp);
  await prisma.user.update({ where: { id: req.auth!.user.id }, data: { email, emailVerifiedAt: new Date() } });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});

authRouter.post("/verify/phone/request", requireAuth, otpLimiter, async (req, res) => {
  const { phone } = body(req, z.object({ phone: phoneSchema }));
  const taken = await prisma.user.findFirst({ where: { phone, id: { not: req.auth!.user.id } } });
  if (taken) throw conflict("This mobile number is already in use by another account.");
  res.json({ sent: true, ...(await issueOtp(phone, "VERIFY_PHONE", "sms")) });
});

authRouter.post("/verify/phone/confirm", requireAuth, authLimiter, async (req, res) => {
  const { phone, otp } = body(req, z.object({ phone: phoneSchema, otp: otpSchema }));
  await verifyOtp(phone, "VERIFY_PHONE", otp);
  await prisma.user.update({ where: { id: req.auth!.user.id }, data: { phone, phoneVerifiedAt: new Date() } });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});

authRouter.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.auth!.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, app: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
  });
  res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.auth!.session?.id })) });
});

authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  const id = param(req, "id");
  const s = await prisma.session.findFirst({ where: { id, userId: req.auth!.user.id } });
  if (!s) throw notFound("Session");
  await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
});

export { normalizeIndianPhone };
