-- CreateTable
CREATE TABLE "TaskProject" (
    "taskId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskProject_pkey" PRIMARY KEY ("taskId","projectId")
);

-- Migrate existing single project assignments to TaskProject
INSERT INTO "TaskProject" ("taskId", "projectId")
SELECT "id", "projectId" FROM "Task" WHERE "projectId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_projectId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Task_workspaceId_projectId_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN IF EXISTS "projectId";

-- CreateIndex
CREATE INDEX "TaskProject_projectId_idx" ON "TaskProject"("projectId");

-- AddForeignKey
ALTER TABLE "TaskProject" ADD CONSTRAINT "TaskProject_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProject" ADD CONSTRAINT "TaskProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
