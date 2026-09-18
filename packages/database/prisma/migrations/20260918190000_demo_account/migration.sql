ALTER TABLE "User"
ADD COLUMN "isDemoAccount" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_single_demo_account"
ON "User" ("isDemoAccount")
WHERE "isDemoAccount" = true;
