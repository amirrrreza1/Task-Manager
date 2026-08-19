import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class CreateProjectDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null'
      ? value.trim()
      : undefined,
  )
  @ValidateIf(
    (o) =>
      typeof o.workspaceId === 'string' &&
      o.workspaceId.length > 0 &&
      o.workspaceId !== 'undefined' &&
      o.workspaceId !== 'null',
  )
  @IsUuidLike()
  workspaceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null'
      ? value.trim()
      : null,
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
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null'
      ? value.trim()
      : null,
  )
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null'
      ? value.trim()
      : null,
  )
  @ValidateIf((o) => typeof o.color === 'string' && o.color.length > 0)
  @IsString()
  @MaxLength(9)
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Color must be a valid hex code (e.g. #2563EB).',
  })
  color?: string | null;
}
