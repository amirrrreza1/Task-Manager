import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { SprintStatus } from '@prisma/client';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

const toOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value !== 'undefined' &&
  value !== 'null'
    ? value.trim()
    : undefined;

export class SprintQueryDto {
  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.workspaceId === 'string' && o.workspaceId.length > 0)
  @IsUuidLike()
  workspaceId?: string;

  @IsOptional()
  @IsEnum(SprintStatus)
  status?: SprintStatus;

  @IsOptional()
  @Transform(toOptionalString)
  @ValidateIf((o) => typeof o.cursor === 'string' && o.cursor.length > 0)
  @IsUuidLike()
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}
