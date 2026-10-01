-- AlterTable
ALTER TABLE "GitHubInstallation" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "previewEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "previewNumber" INTEGER,
ADD COLUMN     "releaseKind" TEXT NOT NULL DEFAULT 'DEPLOY',
ADD COLUMN     "reuseImageId" TEXT,
ADD COLUMN     "secretSnapshot" JSONB,
ADD COLUMN     "sourceDeploymentId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "ownerTransferToId" TEXT;

-- CreateTable
CREATE TABLE "DeploymentRuntime" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "endpoint" TEXT,
    "imageId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "observedAt" TIMESTAMP(3),
    "desiredState" TEXT NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "DeploymentRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeCommand" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actorId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "RuntimeCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentRuntime_deploymentId_key" ON "DeploymentRuntime"("deploymentId");

-- CreateIndex
CREATE INDEX "DeploymentRuntime_workerId_observedAt_idx" ON "DeploymentRuntime"("workerId", "observedAt");

-- CreateIndex
CREATE INDEX "RuntimeCommand_status_createdAt_idx" ON "RuntimeCommand"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DeploymentRuntime" ADD CONSTRAINT "DeploymentRuntime_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeCommand" ADD CONSTRAINT "RuntimeCommand_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DeploymentRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application tables are accessed exclusively through the authenticated API.
ALTER TABLE "DeploymentRuntime" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuntimeCommand" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DeploymentRuntime", "RuntimeCommand" FROM anon, authenticated;
