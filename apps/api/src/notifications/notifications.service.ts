import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { MailService } from '../infrastructure/mail/mail.service';
import { TelegramService } from '../infrastructure/telegram/telegram.service';
import type { DispatchNotificationDto } from './dto/create-notification.dto';
import type { NotificationQueryDto } from './dto/notification-query.dto';

const actorSummary = {
  id: true,
  displayName: true,
  hasAvatar: true,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly telegramService: TelegramService,
  ) {}

  async dispatch(dto: DispatchNotificationDto): Promise<void> {
    try {
      // Deduplicate recipient IDs and remove actor if they performed the action themselves
      const recipientIds = Array.from(new Set(dto.recipientUserIds)).filter(
        (id) => Boolean(id) && id !== dto.actorId,
      );

      if (recipientIds.length === 0) {
        return;
      }

      // Fetch recipient users and actor
      const [recipients, actor] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: recipientIds }, isActive: true },
          select: { id: true, email: true, telegramUsername: true, displayName: true },
        }),
        dto.actorId
          ? this.prisma.user.findUnique({
              where: { id: dto.actorId },
              select: { displayName: true },
            })
          : null,
      ]);

      if (recipients.length === 0) {
        return;
      }

      // 1. Create In-App Notification records in database
      const createdNotifications = await this.prisma.$transaction(
        recipients.map((user) =>
          this.prisma.notification.create({
            data: {
              userId: user.id,
              actorId: dto.actorId || null,
              type: dto.type,
              title: dto.title,
              message: dto.message,
              link: dto.link || null,
            },
          }),
        ),
      );

      const actionUrl = dto.link
        ? `${process.env.CORS_ORIGIN || 'http://localhost:3000'}${dto.link.startsWith('/') ? dto.link : `/${dto.link}`}`
        : undefined;

      const lines = dto.lines && dto.lines.length > 0 ? dto.lines : [dto.message];

      // 2. Dispatch Email Notifications via SMTP (asynchronously in background)
      const emailRecipients = recipients.filter((r) => Boolean(r.email));
      if (emailRecipients.length > 0) {
        void Promise.allSettled(
          emailRecipients.map(async (user) => {
            const sent = await this.mailService.sendNotification({
              to: user.email!,
              subject: `[Task Manager] ${dto.title}`,
              title: dto.title,
              lines,
              actionUrl,
              actionLabel: dto.actionLabel || 'View in Task Manager',
            });
            if (sent) {
              const matched = createdNotifications.find((n) => n.userId === user.id);
              if (matched) {
                await this.prisma.notification
                  .update({
                    where: { id: matched.id },
                    data: { emailSent: true },
                  })
                  .catch(() => undefined);
              }
            }
          }),
        );
      }

      // 3. Dispatch Telegram Group Message with @mentions (asynchronously in background)
      const telegramMentions: string[] = [];
      for (const r of recipients) {
        if (r.telegramUsername) {
          const cleanUser = r.telegramUsername.startsWith('@')
            ? r.telegramUsername
            : `@${r.telegramUsername}`;
          telegramMentions.push(cleanUser);
        } else {
          telegramMentions.push(r.displayName);
        }
      }

      void (async () => {
        const tgLines = [...lines];
        if (actor) {
          tgLines.push(`Triggered by: ${actor.displayName}`);
        }

        const telegramSent = await this.telegramService.sendNotification({
          title: dto.title,
          lines: tgLines,
          mentions: telegramMentions,
          actionUrl,
          actionLabel: dto.actionLabel || 'View in Task Manager',
        });

        if (telegramSent) {
          await this.prisma.notification
            .updateMany({
              where: { id: { in: createdNotifications.map((n) => n.id) } },
              data: { telegramSent: true },
            })
            .catch(() => undefined);
        }
      })();
    } catch (error) {
      this.logger.error(
        `Error during notification dispatch: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  async list(userId: string, query: NotificationQueryDto) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: {
          actor: { select: actorSummary },
        },
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const hasMore = items.length > query.limit;
    const records = hasMore ? items.slice(0, query.limit) : items;

    return {
      items: records,
      unreadCount,
      nextCursor: hasMore ? (records.at(-1)?.id ?? null) : null,
    };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { count: updated.count };
  }
}
