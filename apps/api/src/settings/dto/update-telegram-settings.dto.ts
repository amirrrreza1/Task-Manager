import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTelegramSettingsDto {
  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  telegramProxyUrl?: string | null;
}
