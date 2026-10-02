import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address.js";

describe("client address for request limits", () => {
  it("uses the trusted Cloudflare address on Render", () => {
    expect(clientAddress("203.0.113.8", "10.0.0.2", true)).toBe("203.0.113.8");
    expect(clientAddress("2001:db8::1", "10.0.0.2", true)).toBe("2001:db8::1");
  });
  it("ignores forwarded addresses outside production and rejects invalid values", () => {
    expect(clientAddress("203.0.113.8", "127.0.0.1", false)).toBe("127.0.0.1");
    expect(clientAddress("attacker-controlled", "10.0.0.2", true)).toBe("10.0.0.2");
    expect(clientAddress(undefined, undefined, true)).toBe("unknown-peer");
  });
});
