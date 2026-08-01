import { BadRequestException } from '@nestjs/common';
import { EstimateMode, EstimateUnit } from '@prisma/client';
import type { EstimateDto } from './dto/estimate.dto';

export function assertEstimate(estimate?: EstimateDto | null) {
  if (!estimate) return;
  const maximum = estimate.unit === EstimateUnit.HOURS ? 8_760 : 10_000;
  if (!Number.isInteger(estimate.value) || estimate.value < 1 || estimate.value > maximum) {
    throw new BadRequestException(
      estimate.unit === EstimateUnit.HOURS
        ? 'A time estimate must be between 1 and 8760 hours.'
        : 'A point estimate must be between 1 and 10000 points.',
    );
  }
}

export function estimateUnitForMode(mode: EstimateMode) {
  return mode === EstimateMode.TIME ? EstimateUnit.HOURS : EstimateUnit.POINTS;
}

export function assertEstimateMatchesMode(estimate: EstimateDto | null | undefined, mode: EstimateMode) {
  if (!estimate || estimate.unit === estimateUnitForMode(mode)) return;
  throw new BadRequestException(
    `Estimates must use ${mode === EstimateMode.TIME ? 'hours' : 'points'}, as configured in workspace settings.`,
  );
}
