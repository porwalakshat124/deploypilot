import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(()=>({environmentSecret:{findMany:vi.fn()}}));
vi.mock("@deploypilot/database/client",()=>({db}));
import { sealSecret, openSecret, redactSecretValues, snapshotSecrets, secretsConfigured } from "./environment-secrets.js";
beforeEach(()=>{vi.stubEnv("ENVIRONMENT_SECRET_KEY",Buffer.alloc(32,17).toString("base64"));});
afterEach(()=>vi.unstubAllEnvs());
describe("environment secrets",()=>{
  it("encrypts with unique nonces and binds ciphertext to environment and name",()=>{
    const value="secret-value/with spaces", sealed=sealSecret("env","API_TOKEN",value);
    expect(openSecret(sealed)).toBe(value);
    expect(sealed.ciphertext).not.toContain(value);
    expect(sealSecret("env","API_TOKEN",value).ciphertext).not.toBe(sealed.ciphertext);
    expect(()=>openSecret({...sealed,environmentId:"other"})).toThrow("decrypt");
    expect(()=>openSecret({...sealed,name:"OTHER"})).toThrow("decrypt");
    vi.stubEnv("ENVIRONMENT_SECRET_KEY",Buffer.alloc(32,18).toString("base64"));
    expect(()=>openSecret(sealed)).toThrow("decrypt");
  });
  it("redacts plain, encoded and base64 secret values from logs",()=>{
    const value="secret-value/with spaces", snapshot=[sealSecret("env","API_TOKEN",value)];
    expect(redactSecretValues([value,encodeURIComponent(value),Buffer.from(value).toString("base64")].join(" "),snapshot)).toBe("[REDACTED] [REDACTED] [REDACTED]");
  });
  it("fails before enqueue if any required secret is missing",async()=>{
    db.environmentSecret.findMany.mockResolvedValue([]);
    await expect(snapshotSecrets("env",["DATABASE_URL"])).rejects.toThrow("missing");
  });
  it("reports malformed keys as unconfigured and rejects unsafe names",()=>{
    vi.stubEnv("ENVIRONMENT_SECRET_KEY","bad");expect(secretsConfigured()).toBe(false);
    expect(()=>sealSecret("env","BAD-NAME","valid-value")).toThrow();
  });
});
