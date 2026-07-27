-- A subtask can be independently planned in a sprint without moving its parent task.
ALTER TABLE "Subtask" ADD COLUMN "sprintId" UUID;
CREATE INDEX "Subtask_sprintId_idx" ON "Subtask"("sprintId");
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
