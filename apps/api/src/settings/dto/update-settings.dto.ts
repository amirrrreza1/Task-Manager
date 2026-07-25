import { EstimateMode } from '@prisma/client';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
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
