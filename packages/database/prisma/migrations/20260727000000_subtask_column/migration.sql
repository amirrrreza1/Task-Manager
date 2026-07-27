-- Subtasks can sit on a different board column than their parent task.
ALTER TABLE "Subtask" ADD COLUMN "columnId" UUID;

UPDATE "Subtask" AS s
SET "columnId" = t."columnId"
FROM "Task" AS t
WHERE s."taskId" = t."id";

ALTER TABLE "Subtask" ALTER COLUMN "columnId" SET NOT NULL;

ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "BoardColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Subtask_columnId_position_idx" ON "Subtask"("columnId", "position");
