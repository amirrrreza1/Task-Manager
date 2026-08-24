import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { MailService } from '../infrastructure/mail/mail.service';
import { TelegramService } from '../infrastructure/telegram/telegram.service';
import {
  isSmtpConfigured,
  isTelegramConfigured,
  maskProxyUrl,
  readSmtpEnv,
  readTelegramEnv,
} from '../infrastructure/config/notification-env';
import type { UpdateSettingsDto } from './dto/update-settings.dto';
import type { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import type { UpdateTelegramSettingsDto } from './dto/update-telegram-settings.dto';
import type { TestSmtpDto } from './dto/test-notification-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly telegramService: TelegramService,
  ) {}

  async get(workspaceId?: string) {
    if (workspaceId) {
      const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (ws) {
        return {
          id: ws.id,
          estimateMode: ws.estimateMode,
          sprintDurationDays: ws.sprintDurationDays,
          revision: 1,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
        };
      }
    }
    return this.prisma.appSettings.findUniqueOrThrow({ where: { id: 'default' } });
  }

  async update(input: UpdateSettingsDto, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.appSettings.updateMany({
        where: { id: 'default', revision: input.revision },
        data: {
          estimateMode: input.estimateMode,
          sprintDurationDays: input.sprintDurationDays,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Settings changed elsewhere. Reload and try again.');
      }
      if (input.workspaceId) {
        await transaction.workspace.updateMany({
          where: { id: input.workspaceId },
          data: {
            estimateMode: input.estimateMode,
            sprintDurationDays: input.sprintDurationDays,
          },
        });
      }
      const settings = await transaction.appSettings.findUniqueOrThrow({
        where: { id: 'default' },
      });
      await transaction.activityEvent.create({
        data: {
          eventType: 'settings.updated',
          entityType: 'settings',
          entityId: input.workspaceId ?? '00000000-0000-0000-0000-000000000000',
          actorId,
          payload: {
            version: 1,
            estimateMode: settings.estimateMode,
            sprintDurationDays: settings.sprintDurationDays,
            revision: settings.revision,
            workspaceId: input.workspaceId ?? null,
          },
        },
      });
      return settings;
    });
  }

  async getNotificationSettings() {
    const flags = await this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    const smtp = readSmtpEnv();
    const telegram = readTelegramEnv();
    const dbProxy = flags.telegramProxyUrl ? flags.telegramProxyUrl.trim() : null;
    const effectiveProxy = dbProxy || telegram.proxyUrl;

    return {
      smtpConfigured: isSmtpConfigured(smtp),
      smtpHost: smtp.host ?? '',
      smtpPort: smtp.port,
      smtpSecure: smtp.secure,
      smtpUser: smtp.user ?? '',
      smtpHasPassword: Boolean(smtp.password),
      smtpFromEmail: smtp.fromEmail ?? '',
      smtpFromName: smtp.fromName ?? '',
      smtpEnabled: flags.smtpEnabled,
      telegramConfigured: isTelegramConfigured(telegram),
      telegramHasBotToken: Boolean(telegram.botToken),
      telegramHasChatId: Boolean(telegram.chatId),
      telegramHasMessageThreadId: telegram.messageThreadId !== null,
      telegramMessageThreadId: telegram.messageThreadId,
      telegramProxyUrl: dbProxy ?? '',
      telegramEnvProxyUrl: telegram.proxyUrl ? maskProxyUrl(telegram.proxyUrl) : null,
      telegramHasProxy: Boolean(effectiveProxy),
      telegramEffectiveProxyUrl: maskProxyUrl(effectiveProxy),
      telegramEnabled: flags.telegramEnabled,
      updatedAt: flags.updatedAt,
    };
  }

  async updateSmtp(input: UpdateSmtpSettingsDto, actorId: string) {
    await this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });

    const updated = await this.prisma.notificationConfig.update({
      where: { id: 'default' },
      data: {
        ...(input.smtpEnabled !== undefined ? { smtpEnabled: input.smtpEnabled } : {}),
      },
    });

    await this.prisma.activityEvent.create({
      data: {
        eventType: 'settings.smtp_updated',
        entityType: 'settings',
        entityId: '00000000-0000-0000-0000-000000000000',
        actorId,
        payload: {
          version: 1,
          smtpEnabled: updated.smtpEnabled,
        },
      },
    });

    return this.getNotificationSettings();
  }

  async updateTelegram(input: UpdateTelegramSettingsDto, actorId: string) {
    await this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });

    let proxyUpdate: { telegramProxyUrl?: string | null } = {};
    if (input.telegramProxyUrl !== undefined) {
      const trimmed = input.telegramProxyUrl ? input.telegramProxyUrl.trim() : null;
      proxyUpdate = { telegramProxyUrl: trimmed ? trimmed : null };
    }

    const updated = await this.prisma.notificationConfig.update({
      where: { id: 'default' },
      data: {
        ...(input.telegramEnabled !== undefined ? { telegramEnabled: input.telegramEnabled } : {}),
        ...proxyUpdate,
      },
    });

    await this.prisma.activityEvent.create({
      data: {
        eventType: 'settings.telegram_updated',
        entityType: 'settings',
        entityId: '00000000-0000-0000-0000-000000000000',
        actorId,
        payload: {
          version: 1,
          telegramEnabled: updated.telegramEnabled,
          telegramProxyUrl: maskProxyUrl(updated.telegramProxyUrl),
        },
      },
    });

    return this.getNotificationSettings();
  }

  async testSmtp(input: TestSmtpDto, actorId: string) {
    let targetEmail = input.targetEmail?.trim();
    if (!targetEmail) {
      const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
      if (actor?.email) {
        targetEmail = actor.email;
      }
    }

    if (!targetEmail) {
      throw new BadRequestException(
        'Please provide a destination email address to receive the test email.',
      );
    }

    try {
      return await this.mailService.testConnection(targetEmail);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  async testTelegram() {
    try {
      return await this.telegramService.testConnection();
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
