import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertEstimate,
  assertEstimateMatchesMode,
  estimateUnitForMode,
} from '../dist/common/estimate.js';

describe('estimate validation', () => {
  it('accepts valid time and point estimates', () => {
    assert.doesNotThrow(() => assertEstimate({ value: 8_760, unit: 'HOURS' }));
    assert.doesNotThrow(() => assertEstimate({ value: 0.5, unit: 'HOURS' }));
    assert.doesNotThrow(() => assertEstimate({ value: 0.25, unit: 'HOURS' }));
    assert.doesNotThrow(() => assertEstimate({ value: 10_000, unit: 'POINTS' }));
    assert.doesNotThrow(() => assertEstimate(null));
  });

  it('rejects values outside the unit-specific range', () => {
    assert.throws(() => assertEstimate({ value: 0, unit: 'HOURS' }), /time estimate/i);
    assert.throws(() => assertEstimate({ value: -1, unit: 'HOURS' }), /time estimate/i);
    assert.throws(() => assertEstimate({ value: 10_001, unit: 'POINTS' }), /point estimate/i);
    assert.throws(() => assertEstimate({ value: 1.5, unit: 'POINTS' }), /point estimate/i);
  });

  it('uses the workspace estimate mode as the only allowed unit', () => {
    assert.equal(estimateUnitForMode('TIME'), 'HOURS');
    assert.equal(estimateUnitForMode('POINTS'), 'POINTS');
    assert.doesNotThrow(() => assertEstimateMatchesMode({ value: 4, unit: 'HOURS' }, 'TIME'));
    assert.throws(
      () => assertEstimateMatchesMode({ value: 4, unit: 'POINTS' }, 'TIME'),
      /workspace settings/i,
    );
  });
});
