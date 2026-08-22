import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSmtpSettingsDto {
  @IsOptional()
  @IsBoolean()
  smtpEnabled?: boolean;
}
