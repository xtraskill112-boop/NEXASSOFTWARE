import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import sharp from "sharp";
import { bucket, C, db } from "@naamdev/db";
import { env } from "../../config/env";
import { badRequest, notFound } from "../../lib/errors";

/**
 * Where uploads live:
 * - "firestore" (default; Firebase's free plan has no Cloud Storage): files are stored in Firestore
 *   documents (images re-encoded small enough to fit) and served by the API at /media/<id>.
 * - "firebase": Cloud Storage for Firebase with download-token URLs (paid Blaze plan).
 */
const driver = () => (process.env.STORAGE_DRIVER === "firebase" ? "firebase" : "firestore");
/** Public base URL of this API (Render provides RENDER_EXTERNAL_URL). */
export const publicApiUrl = () => (env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT}`).replace(/\/$/, "");
// Firestore documents are limited to 1 MiB; keep stored files comfortably below that.
const MAX_DOC_BYTES = 900 * 1024;

/** Whether a URL points at a file this API stored (avatars must be our own uploads). */
export function isOurUpload(url: string) {
  return (
    url.startsWith(`${publicApiUrl()}/media/`) ||
    url.startsWith("https://firebasestorage.googleapis.com/") ||
    (!!process.env.FIREBASE_STORAGE_EMULATOR_HOST && url.startsWith(`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/`))
  );
}

async function saveToFirestore(collection: string, data: Buffer, contentType: string, folder: string) {
  if (data.length > MAX_DOC_BYTES) throw badRequest("This file is too large. Please upload one under 900 KB.", undefined, "FILE_TOO_LARGE");
  const ref = db.collection(collection).doc();
  await ref.set({ data, contentType, bytes: data.length, folder, createdAt: new Date() });
  return ref.id;
}

/** Shrinks an image until it fits in a Firestore document. */
async function fitImage(buf: Buffer, format: "webp" | "jpeg", widths: number[], qualities: number[]) {
  for (const width of widths)
    for (const quality of qualities) {
      const img = sharp(buf, { failOn: "error" }).rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true });
      const out = await (format === "webp" ? img.webp({ quality }) : img.jpeg({ quality })).toBuffer({ resolveWithObject: true });
      if (out.info.size <= MAX_DOC_BYTES) return out;
    }
  throw badRequest("This image is too detailed to store. Please upload a smaller photo.", undefined, "FILE_TOO_LARGE");
}

/** Serves a public file stored in Firestore (GET /media/:id). */
export async function readPublicMedia(id: string) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw notFound("File");
  const snap = await db.collection(C.media).doc(id).get();
  if (!snap.exists) throw notFound("File");
  const d = snap.data() as { data: Buffer; contentType: string };
  return { data: Buffer.from(d.data), contentType: d.contentType };
}

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
  if (driver() === "firestore") {
    const out = await fitImage(buf, "webp", [1600, 1200, 900], [80, 70, 60]);
    const id = await saveToFirestore(C.media, out.data, "image/webp", folder);
    return { url: `${publicApiUrl()}/media/${id}.webp`, publicId: id, width: out.info.width, height: out.info.height, bytes: out.info.size };
  }
  const img = sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const out = await img.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const path = datedPath("public", folder, "webp");
  const url = await savePublic(path, out.data, "image/webp");
  return { url, publicId: path, width: out.info.width, height: out.info.height, bytes: out.info.size };
}

export async function storePublicVideo(buf: Buffer): Promise<StoredFile> {
  if (driver() === "firestore")
    throw badRequest("Video uploads need Cloud Storage, which isn't on Firebase's free plan. Add product photos instead.", undefined, "VIDEO_UNAVAILABLE");
  const t = await sniff(buf, VIDEO_TYPES, "an MP4 or WebM video");
  const ext = t.ext === "mov" ? "mp4" : t.ext;
  const path = datedPath("public", "videos", ext);
  const url = await savePublic(path, buf, t.mime === "video/quicktime" ? "video/mp4" : t.mime);
  return { url, publicId: path, bytes: buf.length };
}

/** Private documents (partner KYC) have no download token; only the API streams them to authorised staff. */
export async function storePrivateDocument(buf: Buffer, ownerFolder: string): Promise<{ storageKey: string; mimeType: string }> {
  const t = await sniff(buf, DOC_TYPES, "a JPG, PNG, WebP image or PDF");
  if (driver() === "firestore") {
    const data = t.mime.startsWith("image/") ? (await fitImage(buf, "jpeg", [2000, 1600, 1200], [85, 75, 65])).data : buf;
    const mimeType = t.mime.startsWith("image/") ? "image/jpeg" : "application/pdf";
    const id = await saveToFirestore(C.privateMedia, data, mimeType, ownerFolder.replace(/[^a-zA-Z0-9_/-]/g, ""));
    return { storageKey: `fs:${id}`, mimeType };
  }
  let data = buf;
  if (t.mime.startsWith("image/")) data = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const ext = t.mime === "application/pdf" ? "pdf" : "jpg";
  const mimeType = ext === "pdf" ? "application/pdf" : "image/jpeg";
  const storageKey = `private/${ownerFolder.replace(/[^a-zA-Z0-9_/-]/g, "")}/${randomUUID()}.${ext}`;
  await bucket().file(storageKey).save(data, { resumable: false, contentType: mimeType, metadata: { cacheControl: "private, no-store" } });
  return { storageKey, mimeType };
}

export async function readPrivateDocument(storageKey: string): Promise<Buffer> {
  if (storageKey.startsWith("fs:")) {
    const snap = await db.collection(C.privateMedia).doc(storageKey.slice(3)).get();
    if (!snap.exists) throw notFound("Document");
    return Buffer.from((snap.data() as { data: Buffer }).data);
  }
  if (!storageKey.startsWith("private/") || storageKey.includes("..")) throw badRequest("Invalid document path");
  const [data] = await bucket().file(storageKey).download();
  return data;
}
