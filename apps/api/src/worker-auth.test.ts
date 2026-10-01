import { workerIsActive } from "./worker-auth.js";
import { describe, expect, it } from "vitest";
import { createWorkerToken, hashWorkerToken, workerTokenMatches } from "./worker-auth.js";

describe("worker authentication", () => {
  it("creates a token that matches only its own hash", () => {
    const token = createWorkerToken();
    const hash = hashWorkerToken(token);
    expect(token.startsWith("dpw_")).toBe(true);
    expect(workerTokenMatches(token, hash)).toBe(true);
    expect(workerTokenMatches(`${token}-wrong`, hash)).toBe(false);
  });

  it("does not accept malformed hashes", () => {
    expect(workerTokenMatches("dpw_test", "not-a-sha256-hash")).toBe(false);
  });
});

describe("worker credential lifetime", () => {
  it("rejects revoked and expired credentials, retaining legacy compatibility", () => {
    expect(workerIsActive({ tokenExpiresAt: new Date(1000) }, 1000)).toBe(false);
    expect(workerIsActive({ tokenExpiresAt: new Date(1001) }, 1000)).toBe(true);
    expect(workerIsActive({ revokedAt: new Date() })).toBe(false);
    expect(workerIsActive({ tokenExpiresAt: null })).toBe(true);
    expect(workerIsActive(null)).toBe(false);
  });
});
