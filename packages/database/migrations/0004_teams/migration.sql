-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAudit" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_tokenHash_key" ON "TeamInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "TeamInvite_teamId_createdAt_idx" ON "TeamInvite"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamAudit_teamId_createdAt_idx" ON "TeamAudit"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "Repository_teamId_idx" ON "Repository"("teamId");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAudit" ADD CONSTRAINT "TeamAudit_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application data is accessed only through the authenticated server API.
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Team", "TeamMember", "TeamInvite", "TeamAudit" FROM anon, authenticated;

ALTER TABLE "User" ADD COLUMN "emailNotifications" TEXT NOT NULL DEFAULT 'ALL';

ALTER TABLE "Deployment"
  ADD COLUMN "sourceBranch" TEXT,
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);
CREATE INDEX "Deployment_worker_queue_idx" ON "Deployment" ("targetWorkerId", "status", "createdAt");

CREATE UNIQUE INDEX "TeamMember_one_owner" ON "TeamMember" ("teamId") WHERE role = 'OWNER';
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_no_owner" CHECK (role <> 'OWNER');
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_approval_status" CHECK ("approvalStatus" IN ('NOT_REQUIRED', 'PENDING', 'APPROVED'));
ALTER TABLE "User" ADD CONSTRAINT "User_email_notifications" CHECK ("emailNotifications" IN ('ALL', 'FAILURES', 'OFF'));

ALTER TABLE "Worker" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3), ADD COLUMN "credentialOwnerId" TEXT;
UPDATE "Worker" w SET "credentialOwnerId" = r."ownerId" FROM "Repository" r WHERE r.id = w."repositoryId";
