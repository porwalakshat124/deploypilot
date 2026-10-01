import type { Prisma } from "@prisma/client";

export type Permission = "read" | "deploy" | "admin";
export const rolesFor = (permission: Permission) => permission === "admin"
  ? ["OWNER", "ADMIN"] as const
  : permission === "deploy" ? ["OWNER", "ADMIN", "DEVELOPER"] as const
  : ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"] as const;

/** Personal ownership never bypasses membership after a repository joins a team. */
export function repositoryAccess(userId: string, permission: Permission = "read", includeArchived = false): Prisma.RepositoryWhereInput {
  return { OR: [
    { teamId: null, ownerId: userId, ...(includeArchived ? {} : { archivedAt: null }) },
    { ...(includeArchived ? {} : { archivedAt: null }), team: { archivedAt: null, members: { some: { userId, role: { in: [...rolesFor(permission)] } } } } }
  ] };
}
