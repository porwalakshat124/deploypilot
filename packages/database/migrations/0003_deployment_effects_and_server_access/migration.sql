CREATE TABLE "DeploymentEffect" (
 "id" TEXT NOT NULL PRIMARY KEY, "deploymentId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3),
 "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DeploymentEffect_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeploymentEffect_deploymentId_kind_key" ON "DeploymentEffect"("deploymentId","kind");
CREATE INDEX "DeploymentEffect_status_nextAttemptAt_idx" ON "DeploymentEffect"("status","nextAttemptAt");
-- Server-only application tables: the browser calls the API, never PostgREST.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."User" FROM anon, authenticated;
ALTER TABLE public."GitHubInstallation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."GitHubInstallation" FROM anon, authenticated;
ALTER TABLE public."Repository" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Repository" FROM anon, authenticated;
ALTER TABLE public."Environment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Environment" FROM anon, authenticated;
ALTER TABLE public."DeploymentConfig" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeploymentConfig" FROM anon, authenticated;
ALTER TABLE public."Deployment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Deployment" FROM anon, authenticated;
ALTER TABLE public."DeploymentStage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeploymentStage" FROM anon, authenticated;
ALTER TABLE public."DeploymentLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeploymentLog" FROM anon, authenticated;
ALTER TABLE public."DeploymentEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeploymentEvent" FROM anon, authenticated;
ALTER TABLE public."EnvironmentSecret" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."EnvironmentSecret" FROM anon, authenticated;
ALTER TABLE public."Worker" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Worker" FROM anon, authenticated;
ALTER TABLE public."WebhookDelivery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."WebhookDelivery" FROM anon, authenticated;
ALTER TABLE public."AIDiagnosis" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AIDiagnosis" FROM anon, authenticated;
ALTER TABLE public."DeploymentEffect" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeploymentEffect" FROM anon, authenticated;
