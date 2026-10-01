export function runtimeDatabaseUrl(value = process.env.DATABASE_URL, limit = process.env.DATABASE_CONNECTION_LIMIT) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.hostname.endsWith(".pooler.supabase.com") && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
  if (limit !== undefined) {
    if (!/^[1-9]\d*$/.test(limit) || Number(limit) > 20) throw new Error("DATABASE_CONNECTION_LIMIT must be an integer from 1 to 20");
    url.searchParams.set("connection_limit", limit);
  }
  return url.toString();
}
