import { Injectable, Logger } from '@nestjs/common';
import { ProxyAgent, type Dispatcher } from 'undici';
import { PrismaService } from '../prisma/prisma.service';
import {
  isTelegramConfigured,
  readTelegramEnv,
  type TelegramRuntimeConfig,
} from '../config/notification-env';

export interface SendTelegramOptions {
  title: string;
  lines: string[];
  mentions?: string[]; // e.g. ["@johndoe", "@alice"]
  actionUrl?: string;
  actionLabel?: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private proxyDispatcher: Dispatcher | null = null;
  private cachedProxyUrl: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getDispatcher(proxyUrl: string | null): Dispatcher | undefined {
    if (!proxyUrl) {
      this.proxyDispatcher = null;
      this.cachedProxyUrl = null;
      return undefined;
    }
    if (this.proxyDispatcher && this.cachedProxyUrl === proxyUrl) {
      return this.proxyDispatcher;
    }
    this.cachedProxyUrl = proxyUrl;
    this.proxyDispatcher = new ProxyAgent(proxyUrl);
    return this.proxyDispatcher;
  }

  private getEnvConfig(): TelegramRuntimeConfig {
    return readTelegramEnv();
  }

  private sanitizeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private sanitizeHtmlAttribute(text: string): string {
    return this.sanitizeHtml(text).replace(/"/g, '&quot;');
  }

  private isTelegramUrlButtonAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local')
      ) {
        return false;
      }
      const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
      if (ipv4) {
        const a = Number(ipv4[1]);
        const b = Number(ipv4[2]);
        if (
          a === 10 ||
          a === 127 ||
          (a === 192 && b === 168) ||
          (a === 172 && b >= 16 && b <= 31)
        ) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const flags = await this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    const telegram = this.getEnvConfig();
    const { botToken, chatId, messageThreadId } = telegram;

    if (!botToken) {
      throw new Error(
        'Telegram bot token is not configured. Set TELEGRAM_BOT_TOKEN in the environment.',
      );
    }
    if (!chatId) {
      throw new Error(
        'Telegram group chat ID is not configured. Set TELEGRAM_CHAT_ID in the environment.',
      );
    }

    const effectiveProxy = flags.telegramProxyUrl?.trim() || telegram.proxyUrl;
    const dispatcher = this.getDispatcher(effectiveProxy);
    const meOptions: RequestInit & { dispatcher?: Dispatcher } = {
      ...(dispatcher ? { dispatcher } : {}),
    };
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, meOptions);
    const meData = (await meRes.json()) as {
      ok: boolean;
      description?: string;
      result?: { username: string; first_name: string };
    };

    if (!meData.ok || !meData.result) {
      throw new Error(`Invalid Telegram Bot Token: ${meData.description || 'Bot not found'}`);
    }

    const botName = meData.result.username
      ? `@${meData.result.username}`
      : meData.result.first_name;

    const topicNote =
      messageThreadId !== null ? ` (Topic ID: <code>${messageThreadId}</code>)` : '';
    const testText =
      `🤖 <b>Task Manager Telegram Bot Connected!</b>\n\n` +
      `✅ Bot: <b>${this.sanitizeHtml(botName)}</b>\n` +
      `🕒 Timestamp: <code>${new Date().toISOString()}</code>\n\n` +
      `Notifications and @mentions will be sent to this group chat${topicNote ? ` topic` : ''}.`;

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: testText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    if (messageThreadId !== null) {
      payload.message_thread_id = messageThreadId;
    }

    const sendOptions: RequestInit & { dispatcher?: Dispatcher } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(dispatcher ? { dispatcher } : {}),
    };
    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, sendOptions);

    const sendData = (await sendRes.json()) as { ok: boolean; description?: string };
    if (!sendData.ok) {
      throw new Error(
        `Telegram error: ${sendData.description || 'Could not send message to group chat'}. Ensure the bot is added to the group.`,
      );
    }

    const targetDesc =
      messageThreadId !== null
        ? `group chat (${chatId}, topic ${messageThreadId})`
        : `group chat (${chatId})`;

    return {
      success: true,
      message: `Test message successfully sent by ${botName} to ${targetDesc}.`,
    };
  }

  async sendNotification(options: SendTelegramOptions): Promise<boolean> {
    try {
      const flags = await this.prisma.notificationConfig.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' },
      });
      const telegram = this.getEnvConfig();
      if (!flags.telegramEnabled || !isTelegramConfigured(telegram)) {
        return false;
      }

      let message = `🔔 <b>${this.sanitizeHtml(options.title)}</b>\n\n`;

      for (const line of options.lines) {
        message += `${this.sanitizeHtml(line)}\n`;
      }

      if (options.mentions && options.mentions.length > 0) {
        const mentionText = options.mentions
          .map((m) => {
            const mention = m.startsWith('@') ? m : `@${m}`;
            return this.sanitizeHtml(mention);
          })
          .join(' ');
        message += `\n👤 <b>Assigned / Mentioned:</b> ${mentionText}\n`;
      }

      const actionUrl = options.actionUrl?.trim();
      const actionLabel = options.actionLabel || 'View in Task Manager';
      if (actionUrl) {
        message += `\n🔗 <a href="${this.sanitizeHtmlAttribute(actionUrl)}">${this.sanitizeHtml(actionLabel)}</a>`;
        message += `\n<code>${this.sanitizeHtml(actionUrl)}</code>`;
      }

      const payload: Record<string, unknown> = {
        chat_id: telegram.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        link_preview_options: { is_disabled: true },
      };

      if (telegram.messageThreadId !== null) {
        payload.message_thread_id = telegram.messageThreadId;
      }

      if (actionUrl && this.isTelegramUrlButtonAllowed(actionUrl)) {
        payload.reply_markup = {
          inline_keyboard: [[{ text: actionLabel, url: actionUrl }]],
        };
      }

      const effectiveProxy = flags.telegramProxyUrl?.trim() || telegram.proxyUrl;
      const dispatcher = this.getDispatcher(effectiveProxy);
      const notifyOptions: RequestInit & { dispatcher?: Dispatcher } = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        ...(dispatcher ? { dispatcher } : {}),
      };
      const response = await fetch(
        `https://api.telegram.org/bot${telegram.botToken}/sendMessage`,
        notifyOptions,
      );

      const data = (await response.json()) as { ok: boolean; description?: string };
      if (!data.ok) {
        this.logger.warn(`Telegram API error: ${data.description}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Failed to send Telegram notification: ${(error as Error).message}`);
      return false;
    }
  }
}
