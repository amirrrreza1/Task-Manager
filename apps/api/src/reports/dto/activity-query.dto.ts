import { IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

const ENTITY_TYPES = [
  'task',
  'subtask',
  'sprint',
  'board_column',
  'user',
  'settings',
  'attachment',
  'workspace',
  'project',
] as const;

export class ActivityQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.actorId === 'string' && o.actorId.length > 0)
  @IsUuidLike()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIn(ENTITY_TYPES)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date string lower bound (inclusive)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date string upper bound (inclusive)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 50, maximum: 100, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ description: 'Activity event ID cursor for pagination' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.cursor === 'string' && o.cursor.length > 0)
  @IsUuidLike()
  cursor?: string;
}
