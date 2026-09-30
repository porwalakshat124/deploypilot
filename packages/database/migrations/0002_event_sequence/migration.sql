-- A database-assigned cursor prevents events sharing a timestamp from being skipped.
ALTER TABLE "DeploymentEvent" ADD COLUMN "sequence" SERIAL NOT NULL;
CREATE UNIQUE INDEX "DeploymentEvent_sequence_key" ON "DeploymentEvent"("sequence");
