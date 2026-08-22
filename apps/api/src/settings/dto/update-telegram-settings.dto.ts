import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateTelegramSettingsDto {
  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;
}
