import { BadRequestException } from "@nestjs/common";
export type EnvironmentPolicy = { allowedBranches: string[]; allowedWorkers: string[]; requiresApproval: boolean };
export function environmentPolicy(value: unknown): EnvironmentPolicy {
  if (value == null) return { allowedBranches: [], allowedWorkers: [], requiresApproval: false };
  if (typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Invalid environment policy");
  const input = value as Record<string, unknown>;
  const list = (key: string) => {
    const values = input[key] ?? [];
    if (!Array.isArray(values) || values.length > 100 || values.some(v => typeof v !== "string" || !v.trim() || v.length > 250)) throw new BadRequestException("Invalid " + key);
    return [...new Set(values.map(v => (v as string).trim()))];
  };
  if (input.requiresApproval !== undefined && typeof input.requiresApproval !== "boolean") throw new BadRequestException("Invalid approval policy");
  return { allowedBranches: list("allowedBranches"), allowedWorkers: list("allowedWorkers"), requiresApproval: input.requiresApproval === true };
}
export function assertEnvironmentTarget(value: unknown, branch: string | null | undefined, workerId: string) {
  const policy = environmentPolicy(value);
  if (policy.allowedBranches.length && (!branch || !policy.allowedBranches.includes(branch))) throw new BadRequestException("Branch is not allowed by this environment");
  if (policy.allowedWorkers.length && !policy.allowedWorkers.includes(workerId)) throw new BadRequestException("Worker is not allowed by this environment");
  return policy;
}
