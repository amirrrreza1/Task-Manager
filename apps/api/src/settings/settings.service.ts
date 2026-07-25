import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
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
      const settings = await transaction.appSettings.findUniqueOrThrow({
        where: { id: 'default' },
      });
      await transaction.activityEvent.create({
        data: {
          eventType: 'settings.updated',
          entityType: 'settings',
          entityId: '00000000-0000-0000-0000-000000000000',
          actorId,
          payload: {
            version: 1,
            estimateMode: settings.estimateMode,
            sprintDurationDays: settings.sprintDurationDays,
            revision: settings.revision,
          },
        },
      });
      return settings;
    });
  }
}
