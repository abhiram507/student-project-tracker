import { PrismaClient } from "@prisma/client";

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every save until Postgres refuses new clients. Caching the
 * client on globalThis is the documented workaround.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
