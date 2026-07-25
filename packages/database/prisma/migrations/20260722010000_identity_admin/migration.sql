ALTER TABLE "User"
ADD COLUMN "isBootstrapAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_single_bootstrap_admin_key"
ON "User" ("isBootstrapAdmin")
WHERE "isBootstrapAdmin" = true;

ALTER TABLE "RefreshSession"
ADD COLUMN "familyId" UUID;

UPDATE "RefreshSession"
SET "familyId" = gen_random_uuid()
WHERE "familyId" IS NULL;

ALTER TABLE "RefreshSession"
ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX "RefreshSession_familyId_idx"
ON "RefreshSession" ("familyId");
