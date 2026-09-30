import { BadRequestException } from "@nestjs/common";

export function validateProfile(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Build profile must be an object");
  const p = value as Record<string, unknown>;
  const allowed = new Set(["strategy", "timeoutSeconds", "requiredSecretNames", "dockerfilePath", "dockerContext", "buildArgs", "port", "healthcheckPath", "command"]);
  if (Object.keys(p).some(key => !allowed.has(key))) throw new BadRequestException("Unsupported build profile field. Put install/test/build steps in the Dockerfile; startup command is an argument array.");
  if (p.strategy !== "DOCKERFILE") throw new BadRequestException("Only Dockerfile builds are supported");
  if (!Number.isInteger(p.timeoutSeconds) || Number(p.timeoutSeconds) < 10 || Number(p.timeoutSeconds) > 3600) throw new BadRequestException("Timeout must be 10–3600 seconds");
  for (const field of ["dockerfilePath", "dockerContext"]) {
    const path = p[field];
    if (path !== undefined && (typeof path !== "string" || !path || path.startsWith("-") || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("\0") || path.split("/").includes(".."))) throw new BadRequestException(`${field} must stay inside the repository`);
  }
  if (!Number.isInteger(p.port) || Number(p.port) < 1 || Number(p.port) > 65535) throw new BadRequestException("Container port must be 1–65535");
  if (typeof p.healthcheckPath !== "string" || !/^\/(?!\/)[^\s\\]*$/.test(p.healthcheckPath)) throw new BadRequestException("HTTP health check requires an absolute path");
  if (p.command !== undefined && (!Array.isArray(p.command) || p.command.length > 32 || p.command.some(v => typeof v !== "string" || v.includes("\0") || v.length > 1000))) throw new BadRequestException("Command must be an array of arguments");
  if (p.requiredSecretNames !== undefined && (!Array.isArray(p.requiredSecretNames) || p.requiredSecretNames.length)) throw new BadRequestException("Runtime secret injection is not configured yet");
  if (p.buildArgs !== undefined && (!p.buildArgs || typeof p.buildArgs !== "object" || Array.isArray(p.buildArgs) || Object.keys(p.buildArgs).length > 32 || Object.entries(p.buildArgs).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /secret|token|password|key/i.test(key) || typeof value !== "string" || value.length > 2000 || value.includes("\0")))) throw new BadRequestException("Build arguments must be non-secret string values with valid names");
  return { ...p, requiredSecretNames: [] };
}
