-- Add shared priority for tasks and subtasks.

CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

ALTER TABLE "Task" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Subtask" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';

CREATE INDEX "Task_workspaceId_priority_idx" ON "Task"("workspaceId", "priority");
CREATE INDEX "Subtask_priority_idx" ON "Subtask"("priority");
