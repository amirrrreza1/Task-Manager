import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { EstimateMode } from '@prisma/client';

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(EstimateMode)
  estimateMode?: EstimateMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  sprintDurationDays?: number;
}
