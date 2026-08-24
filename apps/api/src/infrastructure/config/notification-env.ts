export type SmtpRuntimeConfig = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
};

export type TelegramRuntimeConfig = {
  botToken: string | null;
  chatId: string | null;
  messageThreadId: number | null;
};

function envString(key: string): string | null {
  const raw = process.env[key];
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = String(raw)
    .trim()
    .replace(/^['"]|['"]$/g, '');
  return text ? text : null;
}

function envBool(key: string): boolean {
  const value = envString(key)?.toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function envInt(key: string, fallback: number): number {
  const raw = envString(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function readSmtpEnv(): SmtpRuntimeConfig {
  const host = envString('SMTP_HOST');
  const port = envInt('SMTP_PORT', 587);
  const secureFlag = envBool('SMTP_SECURE');

  return {
    host,
    port,
    secure: secureFlag || port === 465,
    user: envString('SMTP_USER'),
    password: envString('SMTP_PASSWORD'),
    fromEmail: envString('SMTP_FROM_EMAIL'),
    fromName: envString('SMTP_FROM_NAME'),
  };
}

export function readTelegramEnv(): TelegramRuntimeConfig {
  const threadRaw = envString('TELEGRAM_MESSAGE_THREAD_ID');
  const parsedThread = threadRaw ? Number(threadRaw) : NaN;
  return {
    botToken: envString('TELEGRAM_BOT_TOKEN'),
    chatId: envString('TELEGRAM_CHAT_ID'),
    messageThreadId: Number.isInteger(parsedThread) ? parsedThread : null,
  };
}

export function isSmtpConfigured(smtp: SmtpRuntimeConfig): boolean {
  return Boolean(smtp.host);
}

export function isTelegramConfigured(telegram: TelegramRuntimeConfig): boolean {
  return Boolean(telegram.botToken && telegram.chatId);
}

export function resolvePublicWebOrigin(): string {
  const explicit = envString('APP_PUBLIC_URL');
  const corsOrigin = envString('CORS_ORIGIN')?.split(',')[0]?.trim();
  const raw = explicit || corsOrigin || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function resolvePublicWebUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = resolvePublicWebOrigin();
  return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}
