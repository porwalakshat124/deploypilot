import { describe, expect, it } from "vitest";
import { assertEnvironmentTarget, environmentPolicy } from "./environment-policy.js";
describe("environment policy", () => {
  it("keeps legacy environments usable without enabling approvals", () => {
    expect(environmentPolicy({ allowedWorkers: [] })).toEqual({ allowedBranches: [], allowedWorkers: [], requiresApproval: false });
  });
  it("rejects malformed policies without coercing approval flags", () => {
    for (const value of [[], "all", { requiresApproval: "false" }, { allowedWorkers: [42] }, { allowedBranches: [""] }]) expect(() => environmentPolicy(value)).toThrow();
  });
  it("denies a worker outside the environment allowlist", () => {
    expect(() => assertEnvironmentTarget({ allowedWorkers: ["a"] }, "main", "b")).toThrow("Worker");
  });
  it("denies missing and mismatched branches", () => {
    for (const branch of [null, undefined, "feature"]) expect(() => assertEnvironmentTarget({ allowedBranches: ["main"] }, branch, "worker")).toThrow("Branch");
  });
  it("allows the explicit branch and worker while preserving approval requirements", () => {
    expect(assertEnvironmentTarget({ allowedBranches: ["main"], allowedWorkers: ["worker"], requiresApproval: true }, "main", "worker").requiresApproval).toBe(true);
  });
});
