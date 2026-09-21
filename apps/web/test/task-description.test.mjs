import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDescriptionLong } from '../lib/task-description.ts';

describe('task-description utilities', () => {
  it('returns false for null, undefined, or empty strings', () => {
    assert.equal(isDescriptionLong(null), false);
    assert.equal(isDescriptionLong(undefined), false);
    assert.equal(isDescriptionLong(''), false);
    assert.equal(isDescriptionLong('   '), false);
  });

  it('returns false for short, single-line or 2-line descriptions', () => {
    assert.equal(isDescriptionLong('Short description'), false);
    assert.equal(
      isDescriptionLong('This is a normal task description that fits comfortably on one line.'),
      false,
    );
    assert.equal(isDescriptionLong('Line 1\nLine 2'), false);
  });

  it('returns true when description exceeds character threshold', () => {
    const longSingleLine =
      'This is a very long task description that definitely exceeds ninety-five characters in total length so it needs an accordion.';
    assert.equal(isDescriptionLong(longSingleLine), true);
  });

  it('returns true when description has 3 or more lines', () => {
    const multiline = 'Step 1: Open app\nStep 2: Log in\nStep 3: Check dashboard';
    assert.equal(isDescriptionLong(multiline), true);
  });

  it('returns true for multiline with empty lines if total lines exceed threshold', () => {
    const multilineWithGaps = 'First line\n\nThird line';
    assert.equal(isDescriptionLong(multilineWithGaps), true);
  });
});
