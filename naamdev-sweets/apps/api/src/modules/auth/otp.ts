import { prisma, type OtpPurpose } from "@naamdev/db";
import { env } from "../../config/env";
import { numericCode, safeEqual, sha256 } from "../../lib/crypto";
import { badRequest, tooMany } from "../../lib/errors";
import { renderEmail } from "../notifications/email-template";
import { sendEmail, sendSms } from "../notifications/providers";

const OTP_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 30_000;
const MAX_PER_HOUR = 6;
const MAX_ATTEMPTS = 5;

const PURPOSE_COPY: Record<OtpPurpose, string> = {
  LOGIN: "log in to",
  REGISTER: "create your account on",
  VERIFY_PHONE: "verify your mobile number on",
  VERIFY_EMAIL: "verify your email on",
  RESET_PASSWORD: "reset your password on",
};

/** Issues an OTP. Returns `devCode` only when OTP_DEV_ECHO is enabled (never in production). */
export async function issueOtp(target: string, purpose: OtpPurpose, channel: "sms" | "email"): Promise<{ expiresInSeconds: number; devCode?: string }> {
  const since = new Date(Date.now() - 3600_000);
  const recent = await prisma.otpCode.findMany({ where: { target, purpose, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  if (recent.length >= MAX_PER_HOUR) throw tooMany("Too many OTP requests. Please try again in an hour.");
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS)
    throw tooMany("Please wait 30 seconds before requesting another OTP.");

  const code = numericCode(6);
  await prisma.otpCode.create({ data: { target, purpose, codeHash: sha256(`${target}:${purpose}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });

  const text = `${code} is your NAAMDEV SWEETS OTP to ${PURPOSE_COPY[purpose]} NAAMDEV. Valid for 10 minutes. Never share it with anyone.`;
  if (channel === "sms") {
    await sendSms(target, text, { otp: code });
  } else {
    const { html } = renderEmail({ title: `Your OTP is ${code}`, body: text });
    await sendEmail(target, "Your NAAMDEV SWEETS verification code", html, text);
  }
  return { expiresInSeconds: OTP_TTL_MS / 1000, devCode: env.OTP_DEV_ECHO ? code : undefined };
}

export async function verifyOtp(target: string, purpose: OtpPurpose, code: string): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { target, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw badRequest("OTP expired or not found. Please request a new one.", undefined, "OTP_INVALID");
  if (otp.attempts >= MAX_ATTEMPTS) throw tooMany("Too many incorrect attempts. Please request a new OTP.");
  const ok = safeEqual(otp.codeHash, sha256(`${target}:${purpose}:${code}`));
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw badRequest("Incorrect OTP. Please check and try again.", undefined, "OTP_INVALID");
  }
  // Atomic consume guards against double use under concurrency.
  const consumed = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw badRequest("OTP already used. Please request a new one.", undefined, "OTP_INVALID");
}
