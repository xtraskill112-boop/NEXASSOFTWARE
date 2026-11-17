import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __naamdevPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__naamdevPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__naamdevPrisma = prisma;

export { PrismaClient, Prisma };
export * from "@prisma/client";
export type Tx = Prisma.TransactionClient;
