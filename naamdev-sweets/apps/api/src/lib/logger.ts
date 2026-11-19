import pino from "pino";
import { env, isProduction, isTest } from "../config/env";

export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.otp", "*.token", "*.razorpay_signature"],
    censor: "[redacted]",
  },
  transport: !isProduction && !isTest ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } : undefined,
});
