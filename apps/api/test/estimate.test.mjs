import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertEstimate,
  assertEstimateMatchesMode,
  calculateSubtasksEstimate,
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

  describe('calculateSubtasksEstimate', () => {
    it('returns null estimate for empty subtasks array', () => {
      assert.deepEqual(calculateSubtasksEstimate([]), {
        estimateValue: null,
        estimateUnit: null,
      });
    });

    it('returns null estimate when all subtasks have null estimateValue', () => {
      const subtasks = [
        { estimateValue: null, estimateUnit: null },
        { estimateValue: null, estimateUnit: 'HOURS' },
      ];
      assert.deepEqual(calculateSubtasksEstimate(subtasks), {
        estimateValue: null,
        estimateUnit: null,
      });
    });

    it('sums fractional hour estimates with floating-point precision handling', () => {
      const subtasks = [
        { estimateValue: 0.1, estimateUnit: 'HOURS' },
        { estimateValue: 0.2, estimateUnit: 'HOURS' },
        { estimateValue: 1.25, estimateUnit: 'HOURS' },
        { estimateValue: null, estimateUnit: null },
      ];
      assert.deepEqual(calculateSubtasksEstimate(subtasks), {
        estimateValue: 1.55,
        estimateUnit: 'HOURS',
      });
    });

    it('sums integer point estimates correctly', () => {
      const subtasks = [
        { estimateValue: 3, estimateUnit: 'POINTS' },
        { estimateValue: 5, estimateUnit: 'POINTS' },
      ];
      assert.deepEqual(calculateSubtasksEstimate(subtasks), {
        estimateValue: 8,
        estimateUnit: 'POINTS',
      });
    });

    it('ignores zero and negative values from invalid subtasks', () => {
      const subtasks = [
        { estimateValue: 0, estimateUnit: 'HOURS' },
        { estimateValue: -2, estimateUnit: 'HOURS' },
        { estimateValue: 4, estimateUnit: 'HOURS' },
      ];
      assert.deepEqual(calculateSubtasksEstimate(subtasks), {
        estimateValue: 4,
        estimateUnit: 'HOURS',
      });
    });
  });
});
