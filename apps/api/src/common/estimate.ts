import { BadRequestException } from '@nestjs/common';
import { EstimateMode, EstimateUnit } from '@prisma/client';
import type { EstimateDto } from './dto/estimate.dto';

export function assertEstimate(estimate?: EstimateDto | null) {
  if (!estimate) return;
  if (typeof estimate.value !== 'number' || !Number.isFinite(estimate.value)) {
    throw new BadRequestException('Estimate value must be a valid number.');
  }
  if (estimate.unit === EstimateUnit.HOURS) {
    if (estimate.value <= 0 || estimate.value > 8_760) {
      throw new BadRequestException('A time estimate must be between 0.01 and 8760 hours.');
    }
  } else if (estimate.unit === EstimateUnit.POINTS) {
    if (!Number.isInteger(estimate.value) || estimate.value < 1 || estimate.value > 10_000) {
      throw new BadRequestException('A point estimate must be between 1 and 10000 points.');
    }
  }
}

export function estimateUnitForMode(mode: EstimateMode) {
  return mode === EstimateMode.TIME ? EstimateUnit.HOURS : EstimateUnit.POINTS;
}

export function assertEstimateMatchesMode(
  estimate: EstimateDto | null | undefined,
  mode: EstimateMode,
) {
  if (!estimate || estimate.unit === estimateUnitForMode(mode)) return;
  throw new BadRequestException(
    `Estimates must use ${mode === EstimateMode.TIME ? 'hours' : 'points'}, as configured in workspace settings.`,
  );
}
