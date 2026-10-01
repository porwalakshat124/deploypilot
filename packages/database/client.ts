import { PrismaClient } from "@prisma/client";
import { runtimeDatabaseUrl } from "./runtime-url.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient({
  datasources: runtimeDatabaseUrl() ? { db: { url: runtimeDatabaseUrl() } } : undefined,
  // The control plane and database can be in different regions. Keep atomic
  // state transitions bounded without assuming every round trip is local.
  transactionOptions: { maxWait: 10000, timeout: 30000 },
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
