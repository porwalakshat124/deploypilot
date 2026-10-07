import { ServiceUnavailableException } from "@nestjs/common";
import { redactLog } from "./diagnosis-context.js";
export function parseDiagnosisResponse(body: unknown) {
  const response = body as { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (response.status !== "completed") throw new ServiceUnavailableException("AI diagnosis did not complete");
  const text = response.output?.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter(item => item.type === "output_text").map(item => item.text ?? "").join("");
  if (!text) throw new ServiceUnavailableException("AI diagnosis returned no structured response");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { throw new ServiceUnavailableException("AI diagnosis returned invalid JSON"); }
  const strings = ["summary", "confidence_reason"];
  const arrays = ["likely_causes", "recommended_actions", "safety_notes", "follow_up_questions"];
  if (!parsed || typeof parsed !== "object" || strings.some(key => typeof parsed[key] !== "string") || !["high", "medium", "low"].includes(String(parsed.confidence)) || arrays.some(key => !Array.isArray(parsed[key]) || (parsed[key] as unknown[]).some(item => typeof item !== "string")) || !Array.isArray(parsed.evidence) || parsed.evidence.some(item => !item || !Number.isInteger(item.sequence) || typeof item.quote !== "string" || !item.quote.trim())) throw new ServiceUnavailableException("AI diagnosis returned an invalid structure");
  for (const key of strings) parsed[key] = redactLog(parsed[key] as string);
  for (const key of arrays) parsed[key] = (parsed[key] as string[]).map(redactLog);
  parsed.evidence = parsed.evidence.map(item => ({ sequence: item.sequence, quote: redactLog(item.quote) }));
  return parsed;
}
