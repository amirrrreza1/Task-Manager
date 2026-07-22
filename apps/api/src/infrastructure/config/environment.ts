import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @IsInt()
  @Min(1)
  API_PORT = 4000;
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

  return validated;
}
