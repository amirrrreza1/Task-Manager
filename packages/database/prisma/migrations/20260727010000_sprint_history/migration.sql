-- Preserve a sprint's final task outcomes even when unfinished work is carried into another sprint.
CREATE TABLE "SprintTaskSnapshot" (
  "id" UUID NOT NULL,
  "sprintId" UUID NOT NULL,
  "taskId" UUID,
  "title" VARCHAR(240) NOT NULL,
  "estimateValue" INTEGER,
  "estimateUnit" "EstimateUnit",
  "columnName" VARCHAR(80) NOT NULL,
  "wasDone" BOOLEAN NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SprintTaskSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SprintTaskSnapshot_estimate_pair_check" CHECK (("estimateValue" IS NULL) = ("estimateUnit" IS NULL))
);

CREATE UNIQUE INDEX "SprintTaskSnapshot_sprintId_taskId_key" ON "SprintTaskSnapshot"("sprintId", "taskId");
CREATE INDEX "SprintTaskSnapshot_sprintId_wasDone_idx" ON "SprintTaskSnapshot"("sprintId", "wasDone");
ALTER TABLE "SprintTaskSnapshot" ADD CONSTRAINT "SprintTaskSnapshot_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SprintTaskSnapshot" ADD CONSTRAINT "SprintTaskSnapshot_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
