import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { toUserColorInput, USER_COLORS } from '../user-colors';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramUsername?: string;

  @IsOptional()
  @Transform(({ value }) => toUserColorInput(value))
  @IsHexColor()
  @IsIn(USER_COLORS)
  color?: string;
}
