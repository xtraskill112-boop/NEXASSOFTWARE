import 'dotenv/config';
import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_ISSUER: z.string().default('stocksense-api'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
  TRUST_PROXY: booleanish.default(false),
  LOG_REQUESTS: booleanish.default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
