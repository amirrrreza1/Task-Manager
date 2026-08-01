-- Preserve each subtask's final state so unfinished subtasks can be resolved
-- after their sprint completes, independently of their parent task.
CREATE TABLE "SprintSubtaskSnapshot" (
  "id" UUID NOT NULL,
  "sprintId" UUID NOT NULL,
  "subtaskId" UUID,
  "taskId" UUID,
  "taskTitle" VARCHAR(240) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "estimateValue" INTEGER,
  "estimateUnit" "EstimateUnit",
  "wasDone" BOOLEAN NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SprintSubtaskSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SprintSubtaskSnapshot_estimate_pair_check" CHECK (("estimateValue" IS NULL) = ("estimateUnit" IS NULL))
);

CREATE UNIQUE INDEX "SprintSubtaskSnapshot_sprintId_subtaskId_key" ON "SprintSubtaskSnapshot"("sprintId", "subtaskId");
CREATE INDEX "SprintSubtaskSnapshot_sprintId_wasDone_idx" ON "SprintSubtaskSnapshot"("sprintId", "wasDone");
ALTER TABLE "SprintSubtaskSnapshot" ADD CONSTRAINT "SprintSubtaskSnapshot_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SprintSubtaskSnapshot" ADD CONSTRAINT "SprintSubtaskSnapshot_subtaskId_fkey"
  FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
