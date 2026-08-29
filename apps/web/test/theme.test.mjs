import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_THEME_STORAGE_KEY,
  DEFAULT_THEMES,
  getThemeScriptCode,
  resolveTheme,
} from '../lib/theme.ts';

describe('theme resolution and persistence logic', () => {
  it('resolves explicit light and dark themes regardless of system theme', () => {
    assert.equal(resolveTheme('dark', 'light', true), 'dark');
    assert.equal(resolveTheme('dark', 'dark', true), 'dark');
    assert.equal(resolveTheme('light', 'dark', true), 'light');
    assert.equal(resolveTheme('light', 'light', true), 'light');
  });

  it('resolves system theme to the matching OS color scheme when enableSystem is true', () => {
    assert.equal(resolveTheme('system', 'dark', true), 'dark');
    assert.equal(resolveTheme('system', 'light', true), 'light');
  });

  it('preserves system theme name when enableSystem is false', () => {
    assert.equal(resolveTheme('system', 'dark', false), 'system');
    assert.equal(resolveTheme('system', 'light', false), 'system');
  });

  it('generates inline theme script that reads from localStorage and sets documentElement classes', () => {
    const script = getThemeScriptCode('theme', 'system', true, true, ['light', 'dark']);
    assert.ok(script.includes('localStorage.getItem("theme")'));
    assert.ok(script.includes('classList.remove'));
    assert.ok(script.includes('classList.add'));
    assert.ok(script.includes('colorScheme'));
  });

  it('exports default storage key and themes array', () => {
    assert.equal(DEFAULT_THEME_STORAGE_KEY, 'theme');
    assert.deepEqual(DEFAULT_THEMES, ['light', 'dark']);
  });
});
