import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message;
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
  }
  // Firestore (gRPC) status codes: 5 NOT_FOUND (update of a missing document), 6 ALREADY_EXISTS (create of an existing one).
  const grpc = (err as { code?: unknown } | null)?.code;
  if (grpc === 5) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Record not found" } });
  if (grpc === 6) return res.status(409).json({ error: { code: "DUPLICATE", message: "This record already exists" } });
  if (grpc === 10) return res.status(409).json({ error: { code: "CONFLICT", message: "Someone else changed this at the same time. Please try again." } });
  if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Malformed JSON body" } });
  }
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } });
}
