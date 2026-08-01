-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarStorageKey" VARCHAR(64),
ADD COLUMN "avatarMimeType" VARCHAR(127),
ADD COLUMN "hasAvatar" BOOLEAN NOT NULL DEFAULT false;
