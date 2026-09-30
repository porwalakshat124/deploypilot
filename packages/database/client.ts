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
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
