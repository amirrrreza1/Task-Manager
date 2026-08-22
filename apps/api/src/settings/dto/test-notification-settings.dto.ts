import { IsEmail, IsOptional } from 'class-validator';

export class TestSmtpDto {
  @IsOptional()
  @IsEmail()
  targetEmail?: string;
}
