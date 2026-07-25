-- V0.3 records who uploaded each attachment. Existing installations may already
-- have metadata from development builds, so backfill from the owning task/subtask creator.
ALTER TABLE "Attachment" ADD COLUMN "uploadedById" UUID;

UPDATE "Attachment" AS attachment
SET "uploadedById" = COALESCE(task."createdById", subtask."createdById")
FROM "Attachment" AS source
LEFT JOIN "Task" AS task ON task."id" = source."taskId"
LEFT JOIN "Subtask" AS subtask ON subtask."id" = source."subtaskId"
WHERE source."id" = attachment."id";

ALTER TABLE "Attachment" ALTER COLUMN "uploadedById" SET NOT NULL;
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
