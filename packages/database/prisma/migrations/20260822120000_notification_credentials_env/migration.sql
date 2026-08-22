-- Move SMTP and Telegram provider credentials out of the database.
-- They are now supplied through environment variables.

ALTER TABLE "NotificationConfig"
  DROP COLUMN IF EXISTS "smtpHost",
  DROP COLUMN IF EXISTS "smtpPort",
  DROP COLUMN IF EXISTS "smtpSecure",
  DROP COLUMN IF EXISTS "smtpUser",
  DROP COLUMN IF EXISTS "smtpPassword",
  DROP COLUMN IF EXISTS "smtpFromEmail",
  DROP COLUMN IF EXISTS "smtpFromName",
  DROP COLUMN IF EXISTS "telegramBotToken",
  DROP COLUMN IF EXISTS "telegramChatId";
