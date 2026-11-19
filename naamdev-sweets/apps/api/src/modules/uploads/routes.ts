import { Router } from "express";
import { badRequest } from "../../lib/errors";
import { requireAnyPermission, requireAuth } from "../../middleware/auth";
import { uploadLimiter } from "../../middleware/rate-limit";
import { memoryUpload, storePublicImage, storePublicVideo } from "./storage";

export const adminUploadsRouter = Router();

adminUploadsRouter.post("/image", uploadLimiter, requireAnyPermission("products.manage", "content.manage", "categories.manage"), memoryUpload(8).single("file"), async (req, res) => {
  if (!req.file) throw badRequest("Choose an image to upload");
  const folder = (["products", "content", "categories"] as const).find((f) => f === req.body?.folder) ?? "products";
  res.status(201).json({ file: await storePublicImage(req.file.buffer, folder) });
});

adminUploadsRouter.post("/video", uploadLimiter, requireAnyPermission("products.manage", "content.manage"), memoryUpload(50).single("file"), async (req, res) => {
  if (!req.file) throw badRequest("Choose a video to upload");
  res.status(201).json({ file: await storePublicVideo(req.file.buffer) });
});

export const customerUploadsRouter = Router();

customerUploadsRouter.post("/return-image", uploadLimiter, requireAuth, memoryUpload(6).single("file"), async (req, res) => {
  if (!req.file) throw badRequest("Choose an image to upload");
  res.status(201).json({ file: await storePublicImage(req.file.buffer, "returns") });
});

customerUploadsRouter.post("/avatar", uploadLimiter, requireAuth, memoryUpload(4).single("file"), async (req, res) => {
  if (!req.file) throw badRequest("Choose an image to upload");
  res.status(201).json({ file: await storePublicImage(req.file.buffer, "avatars") });
});
