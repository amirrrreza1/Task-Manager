import { EstimateMode } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { IsUuidLike } from '../../common/validators/is-uuid-like';

export class UpdateSettingsDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  )
  @ValidateIf((o) => typeof o.workspaceId === 'string' && o.workspaceId.length > 0)
  @IsUuidLike()
  workspaceId?: string;

  @IsEnum(EstimateMode)
  estimateMode!: EstimateMode;

  @IsInt()
  @Min(1)
  @Max(90)
  sprintDurationDays!: number;

  @IsInt()
  @Min(1)
  revision!: number;
}
