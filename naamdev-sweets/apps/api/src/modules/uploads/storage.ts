import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { env, integrations } from "../../config/env";
import { badRequest } from "../../lib/errors";

export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);
const PUBLIC_DIR = path.join(UPLOAD_ROOT, "public");
const PRIVATE_DIR = path.join(UPLOAD_ROOT, "private");

if (integrations.cloudinary)
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

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

function datedDir(base: string, folder: string) {
  const d = new Date();
  return path.join(base, folder, `${d.getUTCFullYear()}`, String(d.getUTCMonth() + 1).padStart(2, "0"));
}

/** Validates, re-encodes (strips metadata/payloads) and stores a public image. */
export async function storePublicImage(buf: Buffer, folder: "products" | "content" | "returns" | "avatars" | "categories"): Promise<StoredFile> {
  await sniff(buf, IMAGE_TYPES, "a JPG, PNG, WebP or AVIF image");
  const img = sharp(buf, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const out = await img.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  if (integrations.cloudinary) {
    const r = await new Promise<{ secure_url: string; public_id: string; width: number; height: number; bytes: number }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: `${env.CLOUDINARY_FOLDER}/${folder}`, resource_type: "image", format: "webp" }, (err, res) => (err || !res ? reject(err) : resolve(res as never)))
        .end(out.data);
    });
    return { url: r.secure_url, publicId: r.public_id, width: r.width, height: r.height, bytes: r.bytes };
  }
  const dir = datedDir(PUBLIC_DIR, folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.webp`;
  await writeFile(path.join(dir, name), out.data);
  const rel = path.relative(PUBLIC_DIR, path.join(dir, name)).split(path.sep).join("/");
  return { url: `/uploads/${rel}`, publicId: null, width: out.info.width, height: out.info.height, bytes: out.info.size };
}

export async function storePublicVideo(buf: Buffer): Promise<StoredFile> {
  const t = await sniff(buf, VIDEO_TYPES, "an MP4 or WebM video");
  if (integrations.cloudinary) {
    const r = await new Promise<{ secure_url: string; public_id: string; bytes: number }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: `${env.CLOUDINARY_FOLDER}/videos`, resource_type: "video" }, (err, res) => (err || !res ? reject(err) : resolve(res as never)))
        .end(buf);
    });
    return { url: r.secure_url, publicId: r.public_id, bytes: r.bytes };
  }
  const dir = datedDir(PUBLIC_DIR, "videos");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${t.ext === "mov" ? "mp4" : t.ext}`;
  await writeFile(path.join(dir, name), buf);
  return { url: `/uploads/${path.relative(PUBLIC_DIR, path.join(dir, name)).split(path.sep).join("/")}`, publicId: null, bytes: buf.length };
}

/** Private documents (partner KYC) never go to a public bucket; they are served only via an authorised endpoint. */
export async function storePrivateDocument(buf: Buffer, ownerFolder: string): Promise<{ storageKey: string; mimeType: string }> {
  const t = await sniff(buf, DOC_TYPES, "a JPG, PNG, WebP image or PDF");
  let data = buf;
  if (t.mime.startsWith("image/")) data = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const ext = t.mime === "application/pdf" ? "pdf" : "jpg";
  const rel = path.join(ownerFolder.replace(/[^a-zA-Z0-9_-]/g, ""), `${randomUUID()}.${ext}`);
  await mkdir(path.join(PRIVATE_DIR, path.dirname(rel)), { recursive: true });
  await writeFile(path.join(PRIVATE_DIR, rel), data);
  return { storageKey: rel.split(path.sep).join("/"), mimeType: ext === "pdf" ? "application/pdf" : "image/jpeg" };
}

export async function readPrivateDocument(storageKey: string): Promise<Buffer> {
  const full = path.resolve(PRIVATE_DIR, storageKey);
  if (!full.startsWith(PRIVATE_DIR + path.sep)) throw badRequest("Invalid document path");
  return readFile(full);
}

export const PUBLIC_UPLOAD_DIR = PUBLIC_DIR;
