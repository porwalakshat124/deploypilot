import { createHash } from "node:crypto";

const secretAssignment = /(password|secret|token|api[_-]?key|private[_-]?key|authorization)\s*[:=]\s*([^\s,;]+)/gi;

export function redactLog(message: string) {
  return message
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|gsk_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED]")
    .replace(/(https?:\/\/|postgres(?:ql)?:\/\/|rediss?:\/\/)([^\s/@]+)@/gi, "$1[REDACTED]@")
    .replace(secretAssignment, (_match, name) => `${name}=[REDACTED]`);
}

export function buildDiagnosisContext(input: { status: string; commitSha: string; failedStage?: string; logs: Array<{ sequence: number; stage: string; level: string; message: string }>; profile: unknown; requiredSecretNames: string[] }) {
  const logs = input.logs.slice(-120).map((log) => ({ sequence: log.sequence, stage: log.stage, level: log.level, message: redactLog(log.message).slice(0, 2000) }));
  const source = input.profile && typeof input.profile === "object" ? input.profile as Record<string, unknown> : {};
  const profile = Object.fromEntries(["strategy", "dockerfilePath", "dockerContext", "port", "healthcheckPath", "timeoutSeconds"].filter(key => key in source).map(key => [key, source[key]]));
  const context = { status: input.status, commitSha: input.commitSha, failedStage: input.failedStage, logs, profile, requiredSecretNames: input.requiredSecretNames };
  const inputHash = createHash("sha256").update(JSON.stringify(context)).digest("hex");
  return { context, inputHash };
}
