import { EstimateUnit } from '@prisma/client';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

export class EstimateDto {
  @IsInt()
  @Min(1)
  @Max(8_760)
  value!: number;

  @IsEnum(EstimateUnit)
  unit!: EstimateUnit;
}

export function estimateData(estimate?: EstimateDto | null) {
  return estimate
    ? { estimateValue: estimate.value, estimateUnit: estimate.unit }
    : { estimateValue: null, estimateUnit: null };
}
