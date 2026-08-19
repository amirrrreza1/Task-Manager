import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTelegramSettingsDto {
  @IsOptional()
  @IsString()
  telegramBotToken?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;
}
