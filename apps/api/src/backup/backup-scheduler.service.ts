import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupService } from './backup.service';
import type { BackupScheduleInfo } from './backup.types';

export function parseScheduleTime(rawTime?: string | null): { hour: number; minute: number } {
  if (!rawTime) {
    return { hour: 0, minute: 0 };
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(rawTime.trim());
  if (!match) {
    return { hour: 0, minute: 0 };
  }
  const hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return { hour, minute };
}

export function calculateNextRun(
  targetHour = 0,
  targetMinute = 0,
  timeZone?: string | null,
  now = new Date(),
): Date {
  if (timeZone && timeZone.trim()) {
    const tz = timeZone.trim();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const partMap: Record<string, number> = {};
      for (const p of parts) {
        if (p.type !== 'literal') {
          partMap[p.type] = parseInt(p.value, 10);
        }
      }

      const currentHour = partMap.hour % 24;
      const currentMinute = partMap.minute;
      const currentSecond = partMap.second;

      const isPassedToday =
        currentHour > targetHour ||
        (currentHour === targetHour && currentMinute >= targetMinute);

      const currentSecondsInDay = currentHour * 3600 + currentMinute * 60 + currentSecond;
      const targetSecondsInDay = targetHour * 3600 + targetMinute * 60;
      let diffSeconds = targetSecondsInDay - currentSecondsInDay;
      if (isPassedToday) {
        diffSeconds += 24 * 3600;
      }

      return new Date(now.getTime() + diffSeconds * 1000);
    } catch {
      // Fall back to local calculation if timezone string is invalid
    }
  }

  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private nextRunDate: Date | null = null;

  private enabled = false;
  private scheduleTimeStr = '00:00';
  private targetHour = 0;
  private targetMinute = 0;
  private timezone: string | null = null;
  private includeAttachments = true;

  constructor(
    private readonly config: ConfigService,
    private readonly backupService: BackupService,
  ) {
    this.initConfiguration();
  }

  private initConfiguration(): void {
    const rawEnabled = (
      this.config.get<string>('BACKUP_NIGHTLY_TELEGRAM_ENABLED') ??
      process.env.BACKUP_NIGHTLY_TELEGRAM_ENABLED ??
      ''
    )
      .toString()
      .trim()
      .toLowerCase();

    this.enabled = rawEnabled === 'true' || rawEnabled === '1' || rawEnabled === 'yes';

    this.scheduleTimeStr = (
      this.config.get<string>('BACKUP_NIGHTLY_TIME') ??
      process.env.BACKUP_NIGHTLY_TIME ??
      '00:00'
    ).trim();

    const parsed = parseScheduleTime(this.scheduleTimeStr);
    this.targetHour = parsed.hour;
    this.targetMinute = parsed.minute;

    const tz = (
      this.config.get<string>('BACKUP_NIGHTLY_TIMEZONE') ??
      process.env.BACKUP_NIGHTLY_TIMEZONE ??
      ''
    ).trim();
    this.timezone = tz ? tz : null;

    const rawAttachments = (
      this.config.get<string>('BACKUP_NIGHTLY_INCLUDE_ATTACHMENTS') ??
      process.env.BACKUP_NIGHTLY_INCLUDE_ATTACHMENTS ??
      'true'
    )
      .toString()
      .trim()
      .toLowerCase();
    this.includeAttachments = rawAttachments !== 'false' && rawAttachments !== '0';
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'Automated nightly Telegram backup is currently disabled. Set BACKUP_NIGHTLY_TELEGRAM_ENABLED=true in .env to activate.',
      );
      return;
    }

    this.scheduleNextRun();
    const tzLabel = this.timezone || 'Server Local Time';
    this.logger.log(
      `Automated nightly Telegram backup scheduled for ${this.scheduleTimeStr} (${tzLabel}). Next run: ${this.nextRunDate?.toISOString()}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleNextRun(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.enabled) {
      this.nextRunDate = null;
      return;
    }

    this.nextRunDate = calculateNextRun(
      this.targetHour,
      this.targetMinute,
      this.timezone,
      new Date(),
    );

    const diffMs = Math.max(1000, this.nextRunDate.getTime() - Date.now());

    this.timer = setTimeout(() => {
      void this.executeScheduledBackup();
    }, diffMs);

    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  private async executeScheduledBackup(): Promise<void> {
    try {
      this.logger.log('Executing automated nightly backup to Telegram...');
      const status = await this.backupService.getStatus();

      if (!status.telegramConfigured) {
        this.logger.warn(
          'Automated nightly backup skipped: Telegram bot token or chat ID is not configured.',
        );
        return;
      }

      if (!status.telegramEnabled) {
        this.logger.warn(
          'Automated nightly backup skipped: Telegram notifications are currently toggled off in settings.',
        );
        return;
      }

      const result = await this.backupService.sendToTelegram(
        {
          includeAttachments: this.includeAttachments,
          automated: true,
        },
        null,
      );

      this.logger.log(
        `Automated nightly backup completed successfully: ${result.filename} (${result.sizeBytes} bytes)`,
      );
    } catch (err) {
      this.logger.error(
        `Automated nightly backup failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      // Re-arm for the next night at 12:00
      this.scheduleNextRun();
    }
  }

  async triggerManualRun(actorId?: string | null): Promise<{
    success: boolean;
    message: string;
    filename?: string;
    sizeBytes?: number;
  }> {
    this.logger.log(
      `Manual trigger requested for automated nightly backup pipeline (actor: ${actorId ?? 'system'})...`,
    );
    const result = await this.backupService.sendToTelegram(
      {
        includeAttachments: this.includeAttachments,
        automated: true,
        captionPrefix: '🧪 <b>Task Manager Automated Backup (Test Run)</b>',
      },
      actorId ?? null,
    );
    return result;
  }

  getScheduleInfo(): BackupScheduleInfo {
    return {
      enabled: this.enabled,
      time: this.scheduleTimeStr,
      timezone: this.timezone || 'Server Local Time',
      includeAttachments: this.includeAttachments,
      nextRunAt: this.enabled && this.nextRunDate ? this.nextRunDate.toISOString() : null,
    };
  }
}
