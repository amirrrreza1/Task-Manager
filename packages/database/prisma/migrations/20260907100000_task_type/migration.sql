-- Add TaskType enum and type column for Task
CREATE TYPE "TaskType" AS ENUM ('TASK', 'BUG');

ALTER TABLE "Task" ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'TASK';

CREATE INDEX "Task_workspaceId_type_idx" ON "Task"("workspaceId", "type");
