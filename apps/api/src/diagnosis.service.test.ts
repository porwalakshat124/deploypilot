import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ deployment: vi.fn(), cached: vi.fn(), save: vi.fn(), budget: vi.fn() }));
vi.mock("@deploypilot/database/client", () => ({ db: { deployment: { findUniqueOrThrow: mocks.deployment }, aIDiagnosis: { findFirst: mocks.cached, upsert: mocks.save } } }));
vi.mock("./chat.service.js", () => ({ consumeAiBudget: mocks.budget }));
import { DiagnosisService } from "./diagnosis.service.js";
const provider = vi.fn();
const result = { summary: "Docker build failed", confidence: "high", confidence_reason: "Explicit error", evidence: [{ sequence: 1, quote: "Dockerfile missing" }], likely_causes: ["Wrong path"], recommended_actions: ["Check Dockerfile path"], safety_notes: [], follow_up_questions: [] };
beforeEach(() => {
  vi.stubEnv("AI_DIAGNOSIS_ENABLED", "true"); vi.stubEnv("GROQ_API_KEY", "test-only"); vi.stubGlobal("fetch", provider);
  vi.clearAllMocks(); mocks.cached.mockResolvedValue(null); mocks.budget.mockResolvedValue(undefined);
  mocks.deployment.mockImplementation(async () => ({ status: "FAILED", commitSha: "fixture", stages: [], config: { profile: {} }, logs: [{ sequence: 1, stage: "BUILD", level: "ERROR", message: "Dockerfile missing token=private-value" }] }));
  provider.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }] })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Groq deployment diagnosis", () => {
  it("redacts evidence before sending and uses strict structured output with the shared budget", async () => {
    expect(await new DiagnosisService().diagnose("fixture", "user")).toEqual(result);
    const [url, request] = provider.mock.calls[0]; const body = JSON.parse(request.body);
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions"); expect(request.body).not.toContain("private-value");
    expect(body.response_format.json_schema.strict).toBe(true); expect(body.max_completion_tokens).toBe(1800);
    expect(mocks.budget).toHaveBeenCalledWith("user"); expect(mocks.deployment.mock.calls[0][0].include.logs.take).toBe(20);
  });
  it("returns cached evidence without spending quota", async () => {
    mocks.cached.mockResolvedValue({ response: result }); expect(await new DiagnosisService().diagnose("fixture", "user")).toEqual(result);
    expect(mocks.budget).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
  });
  it("rejects fabricated evidence without saving it", async () => {
    provider.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ...result, evidence: [{ sequence: 1, quote: "invented error" }] }) } }] })));
    await expect(new DiagnosisService().diagnose("fixture", "user")).rejects.toThrow("outside this deployment"); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not retry or use a paid fallback on exhausted quotas", async () => {
    provider.mockResolvedValue(new Response("private provider error", { status: 429 }));
    await expect(new DiagnosisService().diagnose("fixture", "user")).rejects.toThrow("free quota"); expect(provider).toHaveBeenCalledTimes(1);
  });
  it("does not query deployments or providers when disabled", async () => {
    vi.stubEnv("AI_DIAGNOSIS_ENABLED", "false"); await expect(new DiagnosisService().diagnose("fixture", "user")).rejects.toThrow("disabled"); expect(mocks.deployment).not.toHaveBeenCalled();
  });
});
