import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { db } from "@deploypilot/database/client";

export type SealedSecret = { name: string; environmentId: string; ciphertext: string; keyVersion: number };
const key = () => {
  const value = process.env.ENVIRONMENT_SECRET_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new ServiceUnavailableException("Environment secret encryption is not configured");
  return Buffer.from(value, "base64");
};
export const secretsConfigured = () => { try { key(); return true; } catch { return false; } };
export function secretName(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(value)) throw new BadRequestException("Secret names must be valid environment variable names");
  return value;
}
export function sealSecret(environmentId: string, name: string, value: unknown): SealedSecret {
  secretName(name);
  if (typeof value !== "string" || value.length < 8 || value.length > 16000 || value.includes("\0")) throw new BadRequestException("Secret values must be 8–16000 characters without null bytes");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(environmentId + ":" + name));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { environmentId, name, keyVersion: 1, ciphertext: [iv, cipher.getAuthTag(), encrypted].map(v => v.toString("base64")).join(".") };
}
export function openSecret(secret: SealedSecret) {
  if (secret.keyVersion !== 1) throw new ServiceUnavailableException("Unsupported secret encryption key version");
  try {
    const [iv, tag, encrypted] = secret.ciphertext.split(".").map(value => Buffer.from(value, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(Buffer.from(secret.environmentId + ":" + secret.name));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch { throw new ServiceUnavailableException("Unable to decrypt environment secret"); }
}
export function runtimeEnvironment(snapshot: unknown): Record<string, string> {
  if (!Array.isArray(snapshot)) return {};
  return Object.fromEntries((snapshot as SealedSecret[]).map(secret => [secret.name, openSecret(secret)]));
}
export async function snapshotSecrets(environmentId: string, names: unknown) {
  if (!Array.isArray(names) || !names.length) return [];
  const records = await db.environmentSecret.findMany({ where: { environmentId, name: { in: names.map(secretName) } } });
  if (records.length !== new Set(names).size) throw new BadRequestException("Required environment secrets are missing");
  const snapshot = records.map(secret => ({ ...secret, environmentId }));
  runtimeEnvironment(snapshot); // Fail before enqueue when key or ciphertext is invalid.
  return snapshot.map(({ name, environmentId, ciphertext, keyVersion }) => ({ name, environmentId, ciphertext, keyVersion }));
}
export function profileSecretNames(profile: unknown): string[] {
  const p = profile as { requiredSecretNames?: string[]; buildSecretNames?: string[] };
  return [...new Set([...(p.requiredSecretNames ?? []), ...(p.buildSecretNames ?? [])])];
}
export function splitProfileSecrets(snapshot: unknown, profile: unknown) {
  const values = runtimeEnvironment(snapshot);
  const p = profile as { requiredSecretNames?: string[]; buildSecretNames?: string[] };
  const select = (names: string[] = []) => Object.fromEntries(names.map(name => {
    if (!(name in values)) throw new ServiceUnavailableException("Deployment secret snapshot is incomplete");
    return [name, values[name]];
  }));
  return { runtimeEnvironment: select(p.requiredSecretNames), buildSecrets: select(p.buildSecretNames) };
}
export function redactSecretValues(message: string, snapshot: unknown) {
  for (const value of Object.values(runtimeEnvironment(snapshot)).sort((a,b)=>b.length-a.length)) {
    for (const form of [value, encodeURIComponent(value), Buffer.from(value).toString("base64")]) message = message.split(form).join("[REDACTED]");
  }
  return message;
}
