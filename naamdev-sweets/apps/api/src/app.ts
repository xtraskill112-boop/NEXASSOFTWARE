import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { prisma } from "@naamdev/db";
import { allowedOrigins, env, integrations, isTest } from "./config/env";
import { logger } from "./lib/logger";
import { loadSession, resolveClientApp } from "./middleware/auth";
import { csrfProtection } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { globalLimiter } from "./middleware/rate-limit";
import { accountRouter } from "./modules/account/routes";
import { adminRouter } from "./modules/admin";
import { authRouter } from "./modules/auth/routes";
import { cartRouter } from "./modules/cart/routes";
import { catalogRouter, publicRouter } from "./modules/catalog/routes";
import { deliveryRouter } from "./modules/delivery/routes";
import { checkoutRouter, ordersRouter, paymentsRouter, razorpayWebhook } from "./modules/orders/routes";
import { reviewsRouter } from "./modules/reviews/routes";
import { supportRouter } from "./modules/support/routes";
import { customerUploadsRouter } from "./modules/uploads/routes";
import { PUBLIC_UPLOAD_DIR } from "./modules/uploads/storage";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], imgSrc: ["'self'", "data:"], styleSrc: ["'unsafe-inline'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  if (!isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" || req.url?.startsWith("/static") === true } }));

  // Static assets: seeded catalogue artwork and locally stored uploads (when Cloudinary is not configured).
  app.use("/static", express.static(path.resolve(process.cwd(), "public"), { maxAge: "7d", immutable: false }));
  app.use("/uploads", express.static(PUBLIC_UPLOAD_DIR, { maxAge: "30d", immutable: true, dotfiles: "deny" }));

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "up", time: new Date().toISOString(), integrations });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  // Webhooks need the raw body for signature verification, so they are mounted before body parsers.
  app.post("/api/v1/payments/razorpay/webhook", ...razorpayWebhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser());
  app.use(resolveClientApp);
  app.use("/api", globalLimiter);
  app.use(csrfProtection);
  app.use(loadSession);

  const api = express.Router();
  api.use("/auth", authRouter);
  api.use("/catalog", catalogRouter);
  api.use("/public", publicRouter);
  api.use("/cart", cartRouter);
  api.use("/checkout", checkoutRouter);
  api.use("/orders", ordersRouter);
  api.use("/payments", paymentsRouter);
  api.use("/account", accountRouter);
  api.use("/reviews", reviewsRouter);
  api.use("/support", supportRouter);
  api.use("/uploads", customerUploadsRouter);
  api.use("/delivery", deliveryRouter);
  api.use("/admin", adminRouter);
  app.use("/api/v1", (_req, res, next) => {
    res.set("Cache-Control", res.get("Cache-Control") ?? "no-store");
    next();
  }, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
