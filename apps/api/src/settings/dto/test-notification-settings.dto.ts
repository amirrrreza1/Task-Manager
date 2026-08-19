import { IsEmail, IsOptional, IsString } from 'class-validator';

export class TestSmtpDto {
  @IsOptional()
  @IsEmail()
  targetEmail?: string;
}

export class TestTelegramDto {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsString()
  chatId?: string;
}
