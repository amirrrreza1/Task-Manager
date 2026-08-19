-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "estimateMode" "EstimateMode" NOT NULL DEFAULT 'TIME',
    "sprintDurationDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Workspace_name_check" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "Workspace_sprintDurationDays_check" CHECK ("sprintDurationDays" BETWEEN 1 AND 90)
);

-- Seed default workspace
INSERT INTO "Workspace" ("id", "name", "description", "estimateMode", "sprintDurationDays", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Main Workspace',
  'Default team workspace',
  COALESCE((SELECT "estimateMode" FROM "AppSettings" WHERE "id" = 'default'), 'TIME'),
  COALESCE((SELECT "sprintDurationDays" FROM "AppSettings" WHERE "id" = 'default'), 14),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- Add workspaceId to BoardColumn
ALTER TABLE "BoardColumn" ADD COLUMN "workspaceId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Drop old unique index on position and add per-workspace unique index
DROP INDEX IF EXISTS "BoardColumn_position_key";
DROP INDEX IF EXISTS "BoardColumn_single_done_key";
DROP INDEX IF EXISTS "BoardColumn_single_todo_key";

CREATE UNIQUE INDEX "BoardColumn_workspaceId_position_key" ON "BoardColumn"("workspaceId", "position");
CREATE UNIQUE INDEX "BoardColumn_single_done_key" ON "BoardColumn"("workspaceId", "isDone") WHERE "isDone" = true;
CREATE UNIQUE INDEX "BoardColumn_single_todo_key" ON "BoardColumn"("workspaceId", "isTodo") WHERE "isTodo" = true;

ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add workspaceId to Sprint
ALTER TABLE "Sprint" ADD COLUMN "workspaceId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
DROP INDEX IF EXISTS "Sprint_single_active_key";
CREATE UNIQUE INDEX "Sprint_single_active_key" ON "Sprint"("workspaceId", "status") WHERE "status" = 'ACTIVE';
CREATE INDEX "Sprint_workspaceId_status_idx" ON "Sprint"("workspaceId", "status");

ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add workspaceId to Task
ALTER TABLE "Task" ADD COLUMN "workspaceId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX "Task_workspaceId_columnId_position_idx" ON "Task"("workspaceId", "columnId", "position");

ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
