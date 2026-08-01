-- Remove the legacy seed used for generated avatars. Users without an uploaded photo
-- now render as the first letter of their display name.
ALTER TABLE "User" DROP COLUMN "avatarSeed";
