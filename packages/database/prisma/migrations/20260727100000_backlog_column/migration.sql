ALTER TABLE "BoardColumn" ADD COLUMN "isBacklog" BOOLEAN NOT NULL DEFAULT false;

UPDATE "BoardColumn"
SET "isBacklog" = true
WHERE "position" = (
  SELECT MIN("position") FROM "BoardColumn"
);
