import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    return this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
  }

  private sanitizeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async testConnection(
    customBotToken?: string,
    customChatId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    const botToken = customBotToken || config.telegramBotToken;
    const chatId = customChatId || config.telegramChatId;

    if (!botToken) {
      throw new Error('Telegram Bot Token is not configured.');
    }
    if (!chatId) {
      throw new Error('Telegram Group Chat ID is not configured.');
    }

    // 1. Verify Bot Token with getMe
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
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

    // 2. Send test message to Chat ID
    const testText =
      `🤖 <b>Task Manager Telegram Bot Connected!</b>\n\n` +
      `✅ Bot: <b>${this.sanitizeHtml(botName)}</b>\n` +
      `🕒 Timestamp: <code>${new Date().toISOString()}</code>\n\n` +
      `Notifications and @mentions will be sent to this group chat.`;

    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: testText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const sendData = (await sendRes.json()) as { ok: boolean; description?: string };
    if (!sendData.ok) {
      throw new Error(
        `Telegram error: ${sendData.description || 'Could not send message to group chat'}. Ensure the bot is added to the group.`,
      );
    }

    return {
      success: true,
      message: `Test message successfully sent by ${botName} to group chat (${chatId}).`,
    };
  }

  async sendNotification(options: SendTelegramOptions): Promise<boolean> {
    try {
      const config = await this.getConfig();
      if (!config.telegramEnabled || !config.telegramBotToken || !config.telegramChatId) {
        return false;
      }

      let message = `🔔 <b>${this.sanitizeHtml(options.title)}</b>\n\n`;

      for (const line of options.lines) {
        message += `${this.sanitizeHtml(line)}\n`;
      }

      if (options.mentions && options.mentions.length > 0) {
        const mentionText = options.mentions
          .map((m) => (m.startsWith('@') ? m : `@${m}`))
          .join(' ');
        message += `\n👤 <b>Assigned / Mentioned:</b> ${mentionText}\n`;
      }

      if (options.actionUrl) {
        const label = options.actionLabel || 'View in Task Manager';
        message += `\n🔗 <a href="${options.actionUrl}">${this.sanitizeHtml(label)}</a>`;
      }

      const response = await fetch(
        `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.telegramChatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
        },
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
