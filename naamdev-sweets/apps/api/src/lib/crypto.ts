import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const numericCode = (digits: number) => String(randomInt(0, 10 ** digits)).padStart(digits, "0");

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const key = () => Buffer.from(env.ENCRYPTION_KEY, "hex");

/** AES-256-GCM encryption for sensitive fields at rest (e.g. partner bank account numbers). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv!, "base64"));
  decipher.setAuthTag(Buffer.from(tag!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data!, "base64")), decipher.final()]).toString("utf8");
}

export const referralCode = () => "ND" + randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
