import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  )
  @ValidateIf((o) => typeof o.key === 'string' && o.key.length > 0)
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9-_]+$/, {
    message: 'Project key must contain only letters, numbers, hyphens, and underscores.',
  })
  key?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  )
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  )
  @ValidateIf((o) => typeof o.color === 'string' && o.color.length > 0)
  @IsString()
  @MaxLength(9)
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Color must be a valid hex code (e.g. #2563EB).',
  })
  color?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  )
  @ValidateIf((o) => typeof o.icon === 'string' && o.icon.length > 0)
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z][A-Za-z0-9]*$/, {
    message: 'Icon must be a valid icon name.',
  })
  icon?: string | null;
}
