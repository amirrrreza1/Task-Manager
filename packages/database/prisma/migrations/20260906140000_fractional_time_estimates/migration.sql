-- Fractional time estimates support (e.g. 0.5 or 0.25 hours)

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_estimate_value_check";
ALTER TABLE "Subtask" DROP CONSTRAINT IF EXISTS "Subtask_estimate_value_check";

ALTER TABLE "Task" ALTER COLUMN "estimateValue" TYPE DOUBLE PRECISION;
ALTER TABLE "Subtask" ALTER COLUMN "estimateValue" TYPE DOUBLE PRECISION;
ALTER TABLE "SprintTaskSnapshot" ALTER COLUMN "estimateValue" TYPE DOUBLE PRECISION;
ALTER TABLE "SprintSubtaskSnapshot" ALTER COLUMN "estimateValue" TYPE DOUBLE PRECISION;

ALTER TABLE "Task" ADD CONSTRAINT "Task_estimate_value_check" CHECK (
  "estimateValue" IS NULL OR
  ("estimateUnit" = 'HOURS' AND "estimateValue" > 0 AND "estimateValue" <= 8760) OR
  ("estimateUnit" = 'POINTS' AND "estimateValue" >= 1 AND "estimateValue" <= 10000)
);

ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_estimate_value_check" CHECK (
  "estimateValue" IS NULL OR
  ("estimateUnit" = 'HOURS' AND "estimateValue" > 0 AND "estimateValue" <= 8760) OR
  ("estimateUnit" = 'POINTS' AND "estimateValue" >= 1 AND "estimateValue" <= 10000)
);
