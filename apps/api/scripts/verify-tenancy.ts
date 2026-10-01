import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { repositoryAccess } from "../src/access.js";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
const db = new PrismaClient();
const rollback = new Error("verification rollback");
try {
  await db.$transaction(async tx => {
    const tag = randomUUID();
    const users = await Promise.all(["viewer", "developer", "owner", "outsider"].map(name => tx.user.create({ data: { supabaseId: tag + name, email: tag + name + "@example.invalid" } })));
    const [viewer, developer, owner, outsider] = users;
    const team = await tx.team.create({ data: { name: "Verification " + tag, members: { create: [{ userId: viewer.id, role: "VIEWER" }, { userId: developer.id, role: "DEVELOPER" }, { userId: owner.id, role: "OWNER" }] } } });
    // Original owner is deliberately not a member: ownership must not bypass team access.
    const repo = await tx.repository.create({ data: { ownerId: outsider.id, teamId: team.id, githubRepoId: tag, fullName: "verification/repo", defaultBranch: "main" } });
    for (const [user, read, deploy, admin] of [[viewer, 1, 0, 0], [developer, 1, 1, 0], [owner, 1, 1, 1], [outsider, 0, 0, 0]] as const) {
      for (const [permission, expected] of [["read", read], ["deploy", deploy], ["admin", admin]] as const) {
        assert.equal(await tx.repository.count({ where: { id: repo.id, ...repositoryAccess(user.id, permission) } }), expected, permission + " access");
      }
    }
    await tx.teamMember.delete({ where: { teamId_userId: { teamId: team.id, userId: developer.id } } });
    assert.equal(await tx.repository.count({ where: { id: repo.id, ...repositoryAccess(developer.id) } }), 0, "removed member");
    const profile = await tx.deploymentConfig.create({ data: { repositoryId: repo.id, branchRule: "main", profile: {} } });
    const deployment = await tx.deployment.create({ data: { repositoryId: repo.id, configId: profile.id, commitSha: "a".repeat(40), trigger: "MANUAL", status: "QUEUED", approvalStatus: "PENDING", requestedById: owner.id } });
    assert.equal(await tx.deployment.count({ where: { id: deployment.id, approvalStatus: { in: ["NOT_REQUIRED", "APPROVED"] } } }), 0, "pending execution gate");
    const approve = (userId: string) => tx.deployment.updateMany({
      where: { id: deployment.id, status: "QUEUED", approvalStatus: "PENDING", OR: [{ requestedById: null }, { requestedById: { not: userId } }], repository: repositoryAccess(userId, "admin") },
      data: { approvalStatus: "APPROVED", approvedById: userId, approvedAt: new Date() }
    });
    assert.equal((await approve(owner.id)).count, 0, "self approval denied");
    assert.equal((await approve(viewer.id)).count, 0, "viewer approval denied");
    await tx.teamMember.create({ data: { teamId: team.id, userId: developer.id, role: "ADMIN" } });
    assert.equal((await approve(developer.id)).count, 1, "second administrator approval");
    assert.equal((await approve(developer.id)).count, 0, "approval cannot replay");
    throw rollback;
  }, { maxWait: 10000, timeout: 60000 });
} catch (error) { if (error !== rollback) throw error; }
finally { await db.$disconnect(); }
console.log("PASS: PostgreSQL tenant role matrix, removed membership, approval isolation and replay; all fixtures rolled back.");
