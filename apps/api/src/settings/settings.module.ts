import { Module } from '@nestjs/common';
import { MailModule } from '../infrastructure/mail/mail.module';
import { TelegramModule } from '../infrastructure/telegram/telegram.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [MailModule, TelegramModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
