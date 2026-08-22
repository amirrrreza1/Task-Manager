import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  ADMIN_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  ADMIN_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @IsOptional()
  @IsString()
  APP_PUBLIC_URL?: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN = '15m';

  @IsInt()
  @Min(1)
  @Max(30)
  @Type(() => Number)
  REFRESH_TOKEN_DAYS = 7;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  API_PORT = 4000;

  @IsIn(['local'])
  STORAGE_DRIVER = 'local';

  @IsString()
  @IsNotEmpty()
  UPLOAD_DIRECTORY = './uploads';

  @IsInt()
  @Min(1)
  @Max(1024)
  @Type(() => Number)
  MAX_UPLOAD_SIZE_MB = 25;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsString()
  SMTP_PORT?: string;

  @IsOptional()
  @IsString()
  SMTP_SECURE?: string;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM_EMAIL?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM_NAME?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_CHAT_ID?: string;
}

export function validateEnvironment(configuration: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, configuration, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  if (validated.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }

  return { ...validated };
}
