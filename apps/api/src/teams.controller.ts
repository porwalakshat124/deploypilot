import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@deploypilot/database/client";
import type { Prisma, TeamRole } from "@prisma/client";
import { AuthService } from "./auth.service.js";

export function inviteHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function assignableRole(value: unknown): "ADMIN" | "DEVELOPER" | "VIEWER" {
  if (value !== "ADMIN" && value !== "DEVELOPER" && value !== "VIEWER") throw new BadRequestException("Role must be ADMIN, DEVELOPER or VIEWER");
  return value;
}
export function canManageRole(actor: TeamRole, target: TeamRole) {
  return actor === "OWNER" ? target !== "OWNER" : actor === "ADMIN" && (target === "DEVELOPER" || target === "VIEWER");
}
export function inviteEmail(value: unknown) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new BadRequestException("A valid invitation email is required");
  return value.trim().toLowerCase();
}
const audit = (tx: Prisma.TransactionClient, teamId: string, actorId: string, action: string, subject: string) =>
  tx.teamAudit.create({ data: { teamId, actorId, action, subject } });

@Controller()
export class TeamsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private async membership(teamId: string, userId: string, admin = false) {
    const member = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!member) throw new NotFoundException("Team not found");
    if (admin && member.role !== "OWNER" && member.role !== "ADMIN") throw new ForbiddenException("Team administrator access is required");
    return member;
  }

  private async teamTransaction<T>(teamId: string, userId: string, work: (tx: Prisma.TransactionClient, role: TeamRole) => Promise<T>) {
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
      const current = await tx.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
      if (!current) throw new NotFoundException("Team not found");
      return work(tx, current.role);
    });
  }

  @Get("/v1/me")
  async me(@Req() request: Request) { const user = await this.auth.user(request); return { id: user.id, email: user.email, displayName: user.displayName, emailNotifications: user.emailNotifications }; }

  @Patch("/v1/me")
  async updateMe(@Req() request: Request, @Body() body: { displayName?: unknown; emailNotifications?: unknown }) {
    const user = await this.auth.user(request);
    if (typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.length > 80) throw new BadRequestException("Display name must be 1–80 characters");
    if (body.emailNotifications !== undefined && !["ALL", "FAILURES", "OFF"].includes(String(body.emailNotifications))) throw new BadRequestException("Invalid notification preference");
    return db.user.update({ where: { id: user.id }, data: { displayName: body.displayName.trim(), ...(body.emailNotifications !== undefined ? { emailNotifications: String(body.emailNotifications) } : {}) }, select: { id: true, email: true, displayName: true, emailNotifications: true } });
  }

  @Get("/v1/teams")
  async list(@Req() request: Request) {
    const user = await this.auth.user(request);
    return { teams: await db.team.findMany({ where: { members: { some: { userId: user.id } } }, orderBy: { createdAt: "asc" }, include: { members: { where: { userId: user.id }, select: { role: true } }, _count: { select: { members: true, repositories: true } } } }) };
  }

  @Post("/v1/teams")
  async create(@Req() request: Request, @Body() body: { name?: unknown }) {
    const user = await this.auth.user(request);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) throw new BadRequestException("Team name must be 1–80 characters");
    return db.$transaction(async tx => {
      const team = await tx.team.create({ data: { name: (body.name as string).trim(), members: { create: { userId: user.id, role: "OWNER" } } } });
      await audit(tx, team.id, user.id, "team.created", team.name);
      return team;
    });
  }

  @Get("/v1/teams/:teamId")
  async detail(@Req() request: Request, @Param("teamId") teamId: string) {
    const user = await this.auth.user(request);
    const member = await this.membership(teamId, user.id);
    const admin = member.role === "OWNER" || member.role === "ADMIN";
    const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, include: {
      members: { select: { userId: true, role: true, joinedAt: true, user: { select: { displayName: true, email: true } } }, orderBy: { joinedAt: "asc" } },
      repositories: { select: { id: true, fullName: true } },
      ...(admin ? { invites: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: "desc" } }, audit: { take: 50, orderBy: { createdAt: "desc" } } } : {})
    } });
    return { ...team, role: member.role, currentUserId: user.id };
  }

  @Post("/v1/teams/:teamId/invites")
  async invite(@Req() request: Request, @Param("teamId") teamId: string, @Body() body: { email?: unknown; role?: unknown }) {
    const user = await this.auth.user(request);
    const member = await this.membership(teamId, user.id, true);
    const role = assignableRole(body.role);
    if (!canManageRole(member.role, role)) throw new ForbiddenException("Only the owner can invite administrators");
    const email = inviteEmail(body.email);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const invitation = await this.teamTransaction(teamId, user.id, async (tx, currentRole) => {
      if (!canManageRole(currentRole, role)) throw new ForbiddenException("Cannot invite this role");
      const value = await tx.teamInvite.create({ data: { teamId, email, role, tokenHash: inviteHash(token), expiresAt }, select: { id: true, email: true, role: true, expiresAt: true } });
      await audit(tx, teamId, user.id, "invite.created", email);
      return value;
    });
    return { ...invitation, token };
  }

  @Post("/v1/team-invites/accept")
  async accept(@Req() request: Request, @Body() body: { token?: unknown }) {
    const user = await this.auth.user(request);
    if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw new BadRequestException("Invalid invitation");
    return db.$transaction(async tx => {
      const invite = await tx.teamInvite.findUnique({ where: { tokenHash: inviteHash(body.token as string) } });
      if (!invite || invite.usedAt || invite.expiresAt <= new Date()) throw new BadRequestException("Invitation is invalid or expired");
      if (invite.email !== user.email.toLowerCase()) throw new ForbiddenException("Sign in with the email address this invitation was issued to");
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${invite.teamId} FOR UPDATE`;
      const claimed = await tx.teamInvite.updateMany({ where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException("Invitation has already been used");
      // Existing members keep their role; old invitations can never elevate them.
      await tx.teamMember.upsert({ where: { teamId_userId: { teamId: invite.teamId, userId: user.id } }, update: {}, create: { teamId: invite.teamId, userId: user.id, role: invite.role } });
      await audit(tx, invite.teamId, user.id, "invite.accepted", user.id);
      return { teamId: invite.teamId };
    });
  }

  @Delete("/v1/teams/:teamId/invites/:inviteId")
  async revokeInvite(@Req() request: Request, @Param("teamId") teamId: string, @Param("inviteId") inviteId: string) {
    const user = await this.auth.user(request); const actor = await this.membership(teamId, user.id, true);
    const invite = await db.teamInvite.findFirst({ where: { id: inviteId, teamId } });
    if (!invite) throw new NotFoundException("Invitation not found");
    if (!canManageRole(actor.role, invite.role)) throw new ForbiddenException("Cannot manage this role");
    await this.teamTransaction(teamId, user.id, async (tx, currentRole) => { if (!canManageRole(currentRole, invite.role)) throw new ForbiddenException("Cannot manage this role"); await tx.teamInvite.update({ where: { id: inviteId }, data: { usedAt: new Date() } }); await audit(tx, teamId, user.id, "invite.revoked", invite.email); });
    return { revoked: true };
  }

  @Patch("/v1/teams/:teamId/members/:userId")
  async changeRole(@Req() request: Request, @Param("teamId") teamId: string, @Param("userId") userId: string, @Body() body: { role?: unknown }) {
    const user = await this.auth.user(request); const actor = await this.membership(teamId, user.id, true);
    const role = assignableRole(body.role); const target = await this.membership(teamId, userId);
    if (!canManageRole(actor.role, target.role) || !canManageRole(actor.role, role) || userId === user.id) throw new ForbiddenException("Cannot change this member's role");
    await this.teamTransaction(teamId, user.id, async (tx, currentRole) => {
      const latest = await tx.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId, userId } } });
      if (!canManageRole(currentRole, latest.role) || !canManageRole(currentRole, role)) throw new ForbiddenException("Cannot change this role");
      await tx.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role } });
      await audit(tx, teamId, user.id, "member.role." + role.toLowerCase(), userId);
    });
    return { userId, role };
  }

  @Delete("/v1/teams/:teamId/members/:userId")
  async removeMember(@Req() request: Request, @Param("teamId") teamId: string, @Param("userId") userId: string) {
    const user = await this.auth.user(request); const actor = await this.membership(teamId, user.id);
    const target = await this.membership(teamId, userId);
    if (target.role === "OWNER" || (user.id !== userId && !canManageRole(actor.role, target.role))) throw new ForbiddenException("Cannot remove this member");
    await this.teamTransaction(teamId, user.id, async (tx, currentRole) => {
      const latest = await tx.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId, userId } } });
      if (latest.role === "OWNER" || (user.id !== userId && !canManageRole(currentRole, latest.role))) throw new ForbiddenException("Cannot remove this member");
      await tx.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
      await tx.teamInvite.updateMany({ where: { teamId, email: userId === user.id ? user.email.toLowerCase() : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).email.toLowerCase(), usedAt: null }, data: { usedAt: new Date() } });
      await tx.worker.updateMany({ where: { credentialOwnerId: userId, repository: { teamId }, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, teamId, user.id, "member.removed", userId);
    });
    return { removed: true };
  }

  @Post("/v1/teams/:teamId/repositories/:repositoryId")
  async assignRepository(@Req() request: Request, @Param("teamId") teamId: string, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request); await this.membership(teamId, user.id, true);
    return this.teamTransaction(teamId, user.id, async (tx, currentRole) => {
      if (currentRole !== "OWNER" && currentRole !== "ADMIN") throw new ForbiddenException("Team administrator access is required");
      const updated = await tx.repository.updateMany({ where: { id: repositoryId, ownerId: user.id, teamId: null }, data: { teamId } });
      if (updated.count !== 1) throw new BadRequestException("Only your personal repositories can be connected to a team");
      await audit(tx, teamId, user.id, "repository.connected", repositoryId);
      return { repositoryId, teamId };
    });
  }
}
