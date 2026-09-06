import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatEstimateInput, parseEstimateInput } from '../lib/estimate.ts';

describe('parseEstimateInput', () => {
  it('parses standard positive integers', () => {
    assert.equal(parseEstimateInput('5'), 5);
    assert.equal(parseEstimateInput('1'), 1);
    assert.equal(parseEstimateInput(8), 8);
  });

  it('parses fractional numbers with dot notation', () => {
    assert.equal(parseEstimateInput('0.5'), 0.5);
    assert.equal(parseEstimateInput('0.25'), 0.25);
    assert.equal(parseEstimateInput('1.75'), 1.75);
    assert.equal(parseEstimateInput('  2.5  '), 2.5);
  });

  it('parses fractional numbers with comma notation', () => {
    assert.equal(parseEstimateInput('0,5'), 0.5);
    assert.equal(parseEstimateInput('0,25'), 0.25);
    assert.equal(parseEstimateInput('1,75'), 1.75);
    assert.equal(parseEstimateInput('  3,5  '), 3.5);
  });

  it('returns null for empty or whitespace-only inputs', () => {
    assert.equal(parseEstimateInput(''), null);
    assert.equal(parseEstimateInput('   '), null);
    assert.equal(parseEstimateInput(null), null);
    assert.equal(parseEstimateInput(undefined), null);
  });

  it('returns NaN for non-positive or non-numeric inputs', () => {
    assert.ok(Number.isNaN(parseEstimateInput('0')));
    assert.ok(Number.isNaN(parseEstimateInput('-1')));
    assert.ok(Number.isNaN(parseEstimateInput('-0.5')));
    assert.ok(Number.isNaN(parseEstimateInput('-0,25')));
    assert.ok(Number.isNaN(parseEstimateInput('abc')));
    assert.ok(Number.isNaN(parseEstimateInput('0.5.5')));
  });
});

describe('formatEstimateInput', () => {
  it('formats numbers into input-friendly strings', () => {
    assert.equal(formatEstimateInput(0.5), '0.5');
    assert.equal(formatEstimateInput(0.25), '0.25');
    assert.equal(formatEstimateInput(2), '2');
    assert.equal(formatEstimateInput(null), '');
    assert.equal(formatEstimateInput(undefined), '');
  });
});
