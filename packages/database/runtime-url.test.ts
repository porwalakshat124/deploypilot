import { describe, expect, it } from "vitest";
import { runtimeDatabaseUrl } from "./runtime-url.js";

describe("runtime database pool", () => {
  it("overrides only the pool limit while retaining credentials and transaction pooling", () => {
    const result = new URL(runtimeDatabaseUrl("postgresql://user:dummy@aws-0.pooler.supabase.com:6543/postgres?connection_limit=1&sslmode=require", "5")!);
    expect(result.username).toBe("user");
    expect(result.password).toBe("dummy");
    expect(result.searchParams.get("connection_limit")).toBe("5");
    expect(result.searchParams.get("sslmode")).toBe("require");
    expect(result.searchParams.get("pgbouncer")).toBe("true");
  });
  it("preserves explicit settings without an override", () => {
    const result = new URL(runtimeDatabaseUrl("postgresql://user:dummy@aws-0.pooler.supabase.com/postgres?connection_limit=1&pgbouncer=false", undefined)!);
    expect(result.searchParams.get("connection_limit")).toBe("1");
    expect(result.searchParams.get("pgbouncer")).toBe("false");
  });
  it.each(["0", "21", "5x", "-1", "1.5", ""])("rejects unsafe pool size %s", limit => {
    expect(() => runtimeDatabaseUrl("postgresql://user:dummy@localhost/postgres", limit)).toThrow("DATABASE_CONNECTION_LIMIT");
  });
});
