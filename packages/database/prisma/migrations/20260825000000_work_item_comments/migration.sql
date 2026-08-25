CREATE TABLE "WorkItemComment" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" UUID,
    "subtaskId" UUID,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItemComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkItemComment_owner_check" CHECK (("taskId" IS NOT NULL) <> ("subtaskId" IS NOT NULL))
);

CREATE INDEX "WorkItemComment_taskId_createdAt_idx" ON "WorkItemComment"("taskId", "createdAt");
CREATE INDEX "WorkItemComment_subtaskId_createdAt_idx" ON "WorkItemComment"("subtaskId", "createdAt");

ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_subtaskId_fkey"
  FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItemComment" ADD CONSTRAINT "WorkItemComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "WorkItemComment" ("id", "body", "taskId", "subtaskId", "authorId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "comment", "taskId", "subtaskId", "uploadedById", "createdAt", "createdAt"
FROM "Attachment"
WHERE "comment" IS NOT NULL AND btrim("comment") <> '';

ALTER TABLE "Attachment" DROP COLUMN "comment";
