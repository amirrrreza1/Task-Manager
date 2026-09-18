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

export function calculateSubtasksEstimate(
  subtasks: Array<{ estimateValue?: number | null; estimateUnit?: EstimateUnit | null }>,
  defaultUnit: EstimateUnit = EstimateUnit.HOURS,
): { estimateValue: number | null; estimateUnit: EstimateUnit | null } {
  if (!subtasks || subtasks.length === 0) {
    return { estimateValue: null, estimateUnit: null };
  }

  const estimated = subtasks.filter(
    (s): s is { estimateValue: number; estimateUnit?: EstimateUnit | null } =>
      typeof s.estimateValue === 'number' &&
      Number.isFinite(s.estimateValue) &&
      s.estimateValue > 0,
  );

  if (estimated.length === 0) {
    return { estimateValue: null, estimateUnit: null };
  }

  const unit = estimated.find((s) => s.estimateUnit)?.estimateUnit ?? defaultUnit;

  if (unit === EstimateUnit.POINTS) {
    const sum = Math.round(estimated.reduce((acc, s) => acc + s.estimateValue, 0));
    const clamped = Math.min(Math.max(sum, 1), 10000);
    return { estimateValue: clamped, estimateUnit: EstimateUnit.POINTS };
  } else {
    const rawSum = estimated.reduce((acc, s) => acc + s.estimateValue, 0);
    const sum = Math.round((rawSum + Number.EPSILON) * 100) / 100;
    const clamped = Math.min(Math.max(sum, 0.01), 8760);
    return { estimateValue: clamped, estimateUnit: EstimateUnit.HOURS };
  }
}
