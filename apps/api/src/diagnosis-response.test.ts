import { describe, it, expect } from "vitest";
import { parseDiagnosisResponse } from "./diagnosis-response.js";
describe("Responses API parsing", () => {
  it("extracts structured text from raw REST output", () => {
    const result = { summary: "Build failed", confidence: "low", confidence_reason: "Limited evidence", evidence: [], likely_causes: [], recommended_actions: [], safety_notes: [], follow_up_questions: [] };
    expect(parseDiagnosisResponse({ status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] })).toEqual(result);
  });
  it("rejects incomplete responses and refusals", () => {
    expect(() => parseDiagnosisResponse({ status: "incomplete" })).toThrow();
    expect(() => parseDiagnosisResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] })).toThrow();
  });
});
