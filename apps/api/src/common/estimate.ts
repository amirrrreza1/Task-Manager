import { BadRequestException } from '@nestjs/common';
import { EstimateUnit } from '@prisma/client';
import type { EstimateDto } from './dto/estimate.dto';

export function assertEstimate(estimate?: EstimateDto | null) {
  if (!estimate) return;
  const maximum = estimate.unit === EstimateUnit.MINUTES ? 525_600 : 10_000;
  if (!Number.isInteger(estimate.value) || estimate.value < 1 || estimate.value > maximum) {
    throw new BadRequestException(
      estimate.unit === EstimateUnit.MINUTES
        ? 'A time estimate must be between 1 and 525600 minutes.'
        : 'A point estimate must be between 1 and 10000 points.',
    );
  }
}
