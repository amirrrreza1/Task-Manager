import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { StorageModule } from '../infrastructure/storage/storage.module';
import { TelegramModule } from '../infrastructure/telegram/telegram.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';

@Module({
  imports: [PrismaModule, StorageModule, TelegramModule],
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService],
  exports: [BackupService, BackupSchedulerService],
})
export class BackupModule {}
