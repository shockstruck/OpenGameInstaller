export type ColorScheme = 'dark' | 'light';

const EXPLICIT_THEMES = new Set(['light', 'dark', 'synthwave']);

/**
 * Resolves a stored `general.theme` setting to the palette id that should be
 * applied to `data-theme`. `'system'`, an empty value, or any value this
 * build does not recognise all fall back to the desktop's colour scheme so a
 * setting from a newer build degrades gracefully instead of forcing light.
 */
export function resolveTheme(
  setting: string,
  systemScheme: ColorScheme
): string {
  if (EXPLICIT_THEMES.has(setting)) return setting;
  return systemScheme;
}
