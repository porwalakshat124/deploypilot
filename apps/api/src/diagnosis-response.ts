import { ServiceUnavailableException } from "@nestjs/common";
export function parseDiagnosisResponse(body: unknown) {
  const response = body as { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (response.status !== "completed") throw new ServiceUnavailableException("AI diagnosis did not complete");
  const text = response.output?.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter(item => item.type === "output_text").map(item => item.text ?? "").join("");
  if (!text) throw new ServiceUnavailableException("AI diagnosis returned no structured response");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { throw new ServiceUnavailableException("AI diagnosis returned invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || typeof parsed.summary !== "string" || !["high", "medium", "low"].includes(String(parsed.confidence)) || !Array.isArray(parsed.evidence) || !Array.isArray(parsed.recommended_actions)) throw new ServiceUnavailableException("AI diagnosis returned an invalid structure");
  return parsed;
}
