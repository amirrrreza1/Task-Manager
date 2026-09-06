import { EstimateUnit } from '@prisma/client';
import { IsEnum, IsNumber, IsPositive, Max } from 'class-validator';

export class EstimateDto {
  @IsNumber()
  @IsPositive()
  @Max(10_000)
  value!: number;

  @IsEnum(EstimateUnit)
  unit!: EstimateUnit;
}

export function estimateData(estimate?: EstimateDto | null) {
  return estimate
    ? {
        estimateValue:
          estimate.unit === EstimateUnit.HOURS
            ? Math.round(estimate.value * 100) / 100
            : estimate.value,
        estimateUnit: estimate.unit,
      }
    : { estimateValue: null, estimateUnit: null };
}
