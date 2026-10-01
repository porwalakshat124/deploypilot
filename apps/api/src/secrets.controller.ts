import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
import { AuthService } from "./auth.service.js";
import { repositoryAccess } from "./access.js";
import { sealSecret, secretName, secretsConfigured } from "./environment-secrets.js";
@Controller()
export class SecretsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private async environment(request: Request, id: string) {
    const user = await this.auth.user(request);
    const env = await db.environment.findFirst({ where: { id, repository: repositoryAccess(user.id, "admin") }, select: { id: true } });
    if (!env) throw new NotFoundException("Environment not found");
    return env;
  }
  @Get("/v1/environments/:environmentId/secrets")
  async list(@Req() request: Request, @Param("environmentId") id: string) {
    await this.environment(request, id);
    return { configured: secretsConfigured(), secrets: await db.environmentSecret.findMany({ where: { environmentId: id }, select: { id: true, name: true, keyVersion: true }, orderBy: { name: "asc" } }) };
  }
  @Post("/v1/environments/:environmentId/secrets")
  async save(@Req() request: Request, @Param("environmentId") id: string, @Body() body: { name?: unknown; value?: unknown }) {
    await this.environment(request, id);
    const name = secretName(body.name), sealed = sealSecret(id, name, body.value);
    return db.environmentSecret.upsert({ where: { environmentId_name: { environmentId: id, name } }, update: { ciphertext: sealed.ciphertext, keyVersion: 1 }, create: { environmentId: id, name, ciphertext: sealed.ciphertext, keyVersion: 1 }, select: { id: true, name: true, keyVersion: true } });
  }
  @Delete("/v1/environments/:environmentId/secrets/:name")
  async remove(@Req() request: Request, @Param("environmentId") id: string, @Param("name") name: string) {
    await this.environment(request, id);
    await db.environmentSecret.deleteMany({ where: { environmentId: id, name: secretName(name) } });
    return { deleted: true };
  }
}
