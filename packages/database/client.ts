import { PrismaClient } from "@prisma/client";

function runtimeDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (!url.includes("pooler.supabase.com")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return url.includes("pgbouncer=") ? url : `${url}${separator}pgbouncer=true`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient({
  datasources: runtimeDatabaseUrl() ? { db: { url: runtimeDatabaseUrl() } } : undefined,
  // The control plane and database can be in different regions. Keep atomic
  // state transitions bounded without assuming every round trip is local.
  transactionOptions: { maxWait: 10000, timeout: 30000 },
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
