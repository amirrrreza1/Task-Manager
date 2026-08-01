ALTER TABLE "BoardColumn" ADD COLUMN "isTodo" BOOLEAN NOT NULL DEFAULT false;

WITH "todoCandidate" AS (
  SELECT "id"
  FROM "BoardColumn"
  WHERE "isBacklog" = false AND "isDone" = false
  ORDER BY "position" ASC
  LIMIT 1
)
UPDATE "BoardColumn"
SET "isTodo" = true,
    "name" = 'To Do',
    "color" = '#2563EB'
WHERE "id" IN (SELECT "id" FROM "todoCandidate");

INSERT INTO "BoardColumn" ("id", "name", "color", "position", "isBacklog", "isTodo", "isDone", "updatedAt")
SELECT gen_random_uuid(), 'To Do', '#2563EB', COALESCE(MAX("position"), -1) + 1, false, true, false, CURRENT_TIMESTAMP
FROM "BoardColumn"
HAVING NOT EXISTS (SELECT 1 FROM "BoardColumn" WHERE "isTodo" = true);

UPDATE "BoardColumn"
SET "name" = 'Done',
    "color" = '#059669'
WHERE "isDone" = true;

CREATE UNIQUE INDEX "BoardColumn_single_todo_key" ON "BoardColumn"("isTodo") WHERE "isTodo" = true;

UPDATE "BoardColumn" SET "position" = "position" + 10000;

WITH "orderedColumns" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN "isBacklog" THEN 0
          WHEN "isTodo" THEN 1
          WHEN "isDone" THEN 3
          ELSE 2
        END,
        "position" ASC,
        "id" ASC
    ) - 1 AS "nextPosition"
  FROM "BoardColumn"
)
UPDATE "BoardColumn" AS "column"
SET "position" = "orderedColumns"."nextPosition"
FROM "orderedColumns"
WHERE "column"."id" = "orderedColumns"."id";

WITH "todoColumn" AS (
  SELECT "id" FROM "BoardColumn" WHERE "isTodo" = true
), "backlogColumn" AS (
  SELECT "id" FROM "BoardColumn" WHERE "isBacklog" = true
)
UPDATE "Task" AS "task"
SET "columnId" = (SELECT "id" FROM "todoColumn")
WHERE "task"."sprintId" IS NOT NULL
  AND "task"."columnId" IN (SELECT "id" FROM "backlogColumn");

WITH "todoColumn" AS (
  SELECT "id" FROM "BoardColumn" WHERE "isTodo" = true
), "backlogColumn" AS (
  SELECT "id" FROM "BoardColumn" WHERE "isBacklog" = true
)
UPDATE "Subtask" AS "subtask"
SET "columnId" = (SELECT "id" FROM "todoColumn")
WHERE "subtask"."columnId" IN (SELECT "id" FROM "backlogColumn")
  AND (
    "subtask"."sprintId" IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM "Task" AS "task"
      WHERE "task"."id" = "subtask"."taskId" AND "task"."sprintId" IS NOT NULL
    )
  );

WITH "todoColumn" AS (
  SELECT "id" FROM "BoardColumn" WHERE "isTodo" = true
), "orderedTasks" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "updatedAt" ASC, "id" ASC) * 1024 AS "nextPosition"
  FROM "Task"
  WHERE "columnId" = (SELECT "id" FROM "todoColumn")
)
UPDATE "Task" AS "task"
SET "position" = "orderedTasks"."nextPosition"
FROM "orderedTasks"
WHERE "task"."id" = "orderedTasks"."id";
