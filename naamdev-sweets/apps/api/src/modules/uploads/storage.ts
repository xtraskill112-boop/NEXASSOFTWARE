import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import sharp from "sharp";
import { bucket } from "@naamdev/db";
import { badRequest } from "../../lib/errors";

export const memoryUpload = (maxMb: number) => multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1 } });

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const DOC_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** Detects the real file type from magic bytes — the client-supplied mimetype is never trusted. */
async function sniff(buf: Buffer, allowed: Set<string>, label: string) {
  const t = await fileTypeFromBuffer(buf);
  if (!t || !allowed.has(t.mime)) throw badRequest(`Unsupported file. Please upload ${label}.`, undefined, "UNSUPPORTED_FILE");
  return t;
}

export interface StoredFile { url: string; publicId: string | null; width?: number; height?: number; bytes: number }

function datedPath(prefix: string, folder: string, ext: string) {
  const d = new Date();
  return `${prefix}/${folder}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

/** Firebase Storage download URL (works with the emulator too). */
function downloadUrl(path: string, token: string) {
  const b = bucket().name;
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : "https://firebasestorage.googleapis.com";
  return `${host}/v0/b/${b}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** Uploads a public file with a download token (the bucket itself stays private — see storage.rules). */
async function savePublic(path: string, data: Buffer, contentType: string) {
  const token = randomUUID();
  await bucket()
    .file(path)
    .save(data, { resumable: false, contentType, metadata: { cacheControl: "public, max-age=31536000, immutable", metadata: { firebaseStorageDownloadTokens: token } } });
  return downloadUrl(path, token);
}

/** Validates, re-encodes (strips metadata/payloads) and stores a public image. */
export async function storePublicImage(buf: Buffer, folder: "products" | "content" | "returns" | "avatars" | "categories"): Promise<StoredFile> {
  await sniff(buf, IMAGE_TYPES, "a JPG, PNG, WebP or AVIF image");
  const img = sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const out = await img.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const path = datedPath("public", folder, "webp");
  const url = await savePublic(path, out.data, "image/webp");
  return { url, publicId: path, width: out.info.width, height: out.info.height, bytes: out.info.size };
}

export async function storePublicVideo(buf: Buffer): Promise<StoredFile> {
  const t = await sniff(buf, VIDEO_TYPES, "an MP4 or WebM video");
  const ext = t.ext === "mov" ? "mp4" : t.ext;
  const path = datedPath("public", "videos", ext);
  const url = await savePublic(path, buf, t.mime === "video/quicktime" ? "video/mp4" : t.mime);
  return { url, publicId: path, bytes: buf.length };
}

/** Private documents (partner KYC) have no download token; only the API streams them to authorised staff. */
export async function storePrivateDocument(buf: Buffer, ownerFolder: string): Promise<{ storageKey: string; mimeType: string }> {
  const t = await sniff(buf, DOC_TYPES, "a JPG, PNG, WebP image or PDF");
  let data = buf;
  if (t.mime.startsWith("image/")) data = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const ext = t.mime === "application/pdf" ? "pdf" : "jpg";
  const mimeType = ext === "pdf" ? "application/pdf" : "image/jpeg";
  const storageKey = `private/${ownerFolder.replace(/[^a-zA-Z0-9_/-]/g, "")}/${randomUUID()}.${ext}`;
  await bucket().file(storageKey).save(data, { resumable: false, contentType: mimeType, metadata: { cacheControl: "private, no-store" } });
  return { storageKey, mimeType };
}

export async function readPrivateDocument(storageKey: string): Promise<Buffer> {
  if (!storageKey.startsWith("private/") || storageKey.includes("..")) throw badRequest("Invalid document path");
  const [data] = await bucket().file(storageKey).download();
  return data;
}
