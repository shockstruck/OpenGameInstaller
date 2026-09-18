import { describe, expect, test } from 'bun:test';
import { resolveTheme } from '../src/frontend/lib/theme';

describe('resolveTheme', () => {
  test('follows the desktop colour scheme when the setting is system', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  test('keeps an explicit theme regardless of the desktop colour scheme', () => {
    expect(resolveTheme('synthwave', 'dark')).toBe('synthwave');
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  test('falls back to the desktop colour scheme for unknown or empty settings', () => {
    expect(resolveTheme('', 'dark')).toBe('dark');
    expect(resolveTheme('bogus', 'light')).toBe('light');
  });
});
