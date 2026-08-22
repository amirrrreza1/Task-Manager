import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateTelegramSettingsDto } from './dto/update-telegram-settings.dto';
import { TestSmtpDto } from './dto/test-notification-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@Query('workspaceId') workspaceId?: string) {
    return this.settings.get(workspaceId);
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  update(@Body() input: UpdateSettingsDto, @CurrentUser() viewer: AuthenticatedUser) {
    return this.settings.update(input, viewer.id);
  }

  @Get('notifications')
  @Roles(UserRole.ADMIN)
  getNotifications() {
    return this.settings.getNotificationSettings();
  }

  @Patch('notifications/smtp')
  @Roles(UserRole.ADMIN)
  updateSmtp(@Body() input: UpdateSmtpSettingsDto, @CurrentUser() viewer: AuthenticatedUser) {
    return this.settings.updateSmtp(input, viewer.id);
  }

  @Post('notifications/smtp/test')
  @Roles(UserRole.ADMIN)
  testSmtp(@Body() input: TestSmtpDto, @CurrentUser() viewer: AuthenticatedUser) {
    return this.settings.testSmtp(input, viewer.id);
  }

  @Patch('notifications/telegram')
  @Roles(UserRole.ADMIN)
  updateTelegram(
    @Body() input: UpdateTelegramSettingsDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ) {
    return this.settings.updateTelegram(input, viewer.id);
  }

  @Post('notifications/telegram/test')
  @Roles(UserRole.ADMIN)
  testTelegram() {
    return this.settings.testTelegram();
  }
}
