-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "EstimateMode" AS ENUM ('TIME', 'POINTS');
CREATE TYPE "EstimateUnit" AS ENUM ('MINUTES', 'POINTS');
CREATE TYPE "SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "AttachmentOwnerType" AS ENUM ('TASK', 'SUBTASK');

-- CreateTable
CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "username" VARCHAR(64) NOT NULL,
  "displayName" VARCHAR(100) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
  "avatarSeed" VARCHAR(64) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSettings" (
  "id" VARCHAR(32) NOT NULL DEFAULT 'default',
  "estimateMode" "EstimateMode" NOT NULL DEFAULT 'TIME',
  "sprintDurationDays" INTEGER NOT NULL DEFAULT 14,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppSettings_sprintDurationDays_check" CHECK ("sprintDurationDays" BETWEEN 1 AND 90),
  CONSTRAINT "AppSettings_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "BoardColumn" (
  "id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "color" VARCHAR(9) NOT NULL,
  "position" INTEGER NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BoardColumn_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "BoardColumn_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$')
);

CREATE TABLE "Sprint" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "goal" TEXT,
  "status" "SprintStatus" NOT NULL DEFAULT 'PLANNED',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Sprint_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "Sprint_dates_check" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "SprintComment" (
  "id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "sprintId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SprintComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SprintComment_body_check" CHECK (length(btrim("body")) BETWEEN 1 AND 10000)
);

CREATE TABLE "Task" (
  "id" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "estimateValue" INTEGER,
  "estimateUnit" "EstimateUnit",
  "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
  "columnId" UUID NOT NULL,
  "sprintId" UUID,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Task_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "Task_description_check" CHECK ("description" IS NULL OR length("description") <= 50000),
  CONSTRAINT "Task_estimate_pair_check" CHECK (("estimateValue" IS NULL) = ("estimateUnit" IS NULL)),
  CONSTRAINT "Task_estimate_value_check" CHECK (
    "estimateValue" IS NULL OR
    ("estimateUnit" = 'MINUTES' AND "estimateValue" BETWEEN 1 AND 525600) OR
    ("estimateUnit" = 'POINTS' AND "estimateValue" BETWEEN 1 AND 10000)
  )
);

CREATE TABLE "TaskAssignment" (
  "taskId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId", "userId")
);

CREATE TABLE "Subtask" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "estimateValue" INTEGER,
  "estimateUnit" "EstimateUnit",
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "assigneeId" UUID,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subtask_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "Subtask_description_check" CHECK ("description" IS NULL OR length("description") <= 50000),
  CONSTRAINT "Subtask_estimate_pair_check" CHECK (("estimateValue" IS NULL) = ("estimateUnit" IS NULL)),
  CONSTRAINT "Subtask_estimate_value_check" CHECK (
    "estimateValue" IS NULL OR
    ("estimateUnit" = 'MINUTES' AND "estimateValue" BETWEEN 1 AND 525600) OR
    ("estimateUnit" = 'POINTS' AND "estimateValue" BETWEEN 1 AND 10000)
  )
);

CREATE TABLE "Attachment" (
  "id" UUID NOT NULL,
  "ownerType" "AttachmentOwnerType" NOT NULL,
  "taskId" UUID,
  "subtaskId" UUID,
  "storageKey" TEXT NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(127) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_owner_check" CHECK (
    ("ownerType" = 'TASK' AND "taskId" IS NOT NULL AND "subtaskId" IS NULL) OR
    ("ownerType" = 'SUBTASK' AND "subtaskId" IS NOT NULL AND "taskId" IS NULL)
  ),
  CONSTRAINT "Attachment_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "Attachment_checksum_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "RefreshSession" (
  "id" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityEvent" (
  "id" UUID NOT NULL,
  "eventType" VARCHAR(100) NOT NULL,
  "entityType" VARCHAR(50) NOT NULL,
  "entityId" UUID NOT NULL,
  "actorId" UUID,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxMessage" (
  "id" UUID NOT NULL,
  "topic" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxMessage_attempts_check" CHECK ("attempts" >= 0)
);

-- Indexes
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_username_ci_key" ON "User"(lower("username"));
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE UNIQUE INDEX "BoardColumn_position_key" ON "BoardColumn"("position");
CREATE UNIQUE INDEX "BoardColumn_single_done_key" ON "BoardColumn"("isDone") WHERE "isDone" = true;
CREATE INDEX "Sprint_status_idx" ON "Sprint"("status");
CREATE INDEX "Sprint_startsAt_endsAt_idx" ON "Sprint"("startsAt", "endsAt");
CREATE UNIQUE INDEX "Sprint_single_active_key" ON "Sprint"("status") WHERE "status" = 'ACTIVE';
CREATE INDEX "SprintComment_sprintId_createdAt_idx" ON "SprintComment"("sprintId", "createdAt");
CREATE INDEX "Task_columnId_position_idx" ON "Task"("columnId", "position");
CREATE INDEX "Task_sprintId_idx" ON "Task"("sprintId");
CREATE INDEX "Task_updatedAt_idx" ON "Task"("updatedAt");
CREATE INDEX "TaskAssignment_userId_idx" ON "TaskAssignment"("userId");
CREATE INDEX "Subtask_taskId_position_idx" ON "Subtask"("taskId", "position");
CREATE INDEX "Subtask_assigneeId_idx" ON "Subtask"("assigneeId");
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");
CREATE INDEX "Attachment_subtaskId_idx" ON "Attachment"("subtaskId");
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
CREATE INDEX "ActivityEvent_entityType_entityId_createdAt_idx" ON "ActivityEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "ActivityEvent_actorId_createdAt_idx" ON "ActivityEvent"("actorId", "createdAt");
CREATE INDEX "ActivityEvent_eventType_createdAt_idx" ON "ActivityEvent"("eventType", "createdAt");
CREATE INDEX "OutboxMessage_processedAt_availableAt_idx" ON "OutboxMessage"("processedAt", "availableAt");

-- Foreign keys
ALTER TABLE "SprintComment" ADD CONSTRAINT "SprintComment_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SprintComment" ADD CONSTRAINT "SprintComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "BoardColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed singleton settings and the initial board. Application bootstrap owns the admin user.
INSERT INTO "AppSettings" ("id", "estimateMode", "sprintDurationDays", "revision", "updatedAt")
VALUES ('default', 'TIME', 14, 1, CURRENT_TIMESTAMP);

INSERT INTO "BoardColumn" ("id", "name", "color", "position", "isDone", "updatedAt") VALUES
  (gen_random_uuid(), 'Backlog', '#64748B', 0, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ready', '#3B82F6', 1, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'In progress', '#F59E0B', 2, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Review', '#8B5CF6', 3, false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Done', '#10B981', 4, true, CURRENT_TIMESTAMP);
