-- AlterTable
ALTER TABLE "BoardColumn" ADD COLUMN "isReview" BOOLEAN NOT NULL DEFAULT false;

-- Update existing "Review" columns to have isReview = true
UPDATE "BoardColumn" SET "isReview" = true WHERE LOWER("name") = 'review' OR LOWER("name") = 'in review';

-- CreateTable
CREATE TABLE "ProjectSenior" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSenior_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "ProjectSenior_userId_idx" ON "ProjectSenior"("userId");

-- AddForeignKey
ALTER TABLE "ProjectSenior" ADD CONSTRAINT "ProjectSenior_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSenior" ADD CONSTRAINT "ProjectSenior_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
