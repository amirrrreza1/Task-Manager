-- Time estimates switch from whole minutes to whole hours.

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_estimate_value_check";
ALTER TABLE "Subtask" DROP CONSTRAINT IF EXISTS "Subtask_estimate_value_check";

UPDATE "Task"
SET "estimateValue" = LEAST(8760, GREATEST(1, CEIL("estimateValue"::numeric / 60)::integer))
WHERE "estimateUnit" = 'MINUTES';

UPDATE "Subtask"
SET "estimateValue" = LEAST(8760, GREATEST(1, CEIL("estimateValue"::numeric / 60)::integer))
WHERE "estimateUnit" = 'MINUTES';

UPDATE "SprintTaskSnapshot"
SET "estimateValue" = LEAST(8760, GREATEST(1, CEIL("estimateValue"::numeric / 60)::integer))
WHERE "estimateUnit" = 'MINUTES';

ALTER TYPE "EstimateUnit" RENAME VALUE 'MINUTES' TO 'HOURS';

ALTER TABLE "Task" ADD CONSTRAINT "Task_estimate_value_check" CHECK (
  "estimateValue" IS NULL OR
  ("estimateUnit" = 'HOURS' AND "estimateValue" BETWEEN 1 AND 8760) OR
  ("estimateUnit" = 'POINTS' AND "estimateValue" BETWEEN 1 AND 10000)
);

ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_estimate_value_check" CHECK (
  "estimateValue" IS NULL OR
  ("estimateUnit" = 'HOURS' AND "estimateValue" BETWEEN 1 AND 8760) OR
  ("estimateUnit" = 'POINTS' AND "estimateValue" BETWEEN 1 AND 10000)
);
