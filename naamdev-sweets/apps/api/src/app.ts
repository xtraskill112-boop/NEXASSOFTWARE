import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { C, db } from "@naamdev/db";
import { allowedOrigins, env, integrations, isTest } from "./config/env";
import { tick } from "./jobs/scheduler";
import { finishBackgroundWork } from "./lib/background";
import { safeEqual } from "./lib/crypto";
import { logger } from "./lib/logger";
import { loadSession, resolveClientApp } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { globalLimiter } from "./middleware/rate-limit";
import { accountRouter } from "./modules/account/routes";
import { adminRouter } from "./modules/admin";
import { authRouter } from "./modules/auth/routes";
import { CART_TOKEN_HEADER } from "./modules/cart/service";
import { cartRouter } from "./modules/cart/routes";
import { catalogRouter, publicRouter } from "./modules/catalog/routes";
import { deliveryRouter } from "./modules/delivery/routes";
import { checkoutRouter, ordersRouter, paymentsRouter, razorpayWebhook } from "./modules/orders/routes";
import { reviewsRouter } from "./modules/reviews/routes";
import { supportRouter } from "./modules/support/routes";
import { customerUploadsRouter } from "./modules/uploads/routes";
import { readPublicMedia } from "./modules/uploads/storage";

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
  // Requests authenticate with a bearer token, not cookies, so CORS never needs credentials.
  app.use(cors({ origin: allowedOrigins, exposedHeaders: [CART_TOKEN_HEADER], maxAge: 600 }));
  if (!isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/healthz" || req.url?.startsWith("/static") === true || req.url?.startsWith("/media/") === true } }));

  // Responses wait for notifications/live updates the request started (CPU is throttled after a response on Cloud Run).
  app.use(finishBackgroundWork());

  // Seeded catalogue artwork (served through Firebase Hosting's /static/** rewrite).
  app.use("/static", express.static(path.resolve(process.cwd(), "public"), { maxAge: "7d", immutable: false }));

  // Liveness without a database read (keep-alive pings and the host's health check).
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Uploaded photos stored in Firestore (free plan has no Cloud Storage). Immutable, so cached long.
  app.get("/media/:file", async (req, res) => {
    const { data, contentType } = await readPublicMedia(String(req.params.file).replace(/\.[a-z0-9]+$/i, ""));
    res.set({ "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
    res.send(data);
  });

  app.get("/health", async (_req, res) => {
    try {
      await db.collection(C.settings).limit(1).get();
      res.json({ status: "ok", db: "up", time: new Date().toISOString(), integrations });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  // Optional external trigger for the background jobs, with the shared secret header (?sweepSeconds=45
  // keeps expiring delivery offers every 15 s for most of the minute, at the cost of a longer request).
  app.post("/internal/jobs/tick", async (req, res) => {
    const secret = req.get("x-jobs-secret") ?? "";
    if (!env.JOBS_SECRET || !safeEqual(secret, env.JOBS_SECRET)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
    const sweep = Math.min(Math.max(Number(req.query.sweepSeconds ?? 0), 0), 50) * 1000;
    res.json({ results: await tick(sweep) });
  });

  // Webhooks need the raw body for signature verification, so they are mounted before body parsers.
  app.post("/api/v1/payments/razorpay/webhook", ...razorpayWebhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(resolveClientApp);
  app.use("/api", globalLimiter);
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
