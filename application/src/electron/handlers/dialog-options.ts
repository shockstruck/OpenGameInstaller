import type { OpenDialogOptions } from 'electron';

/**
 * Returns the options with `showHiddenFiles` added to `properties`, so open
 * dialogs can browse into dot-directories. Existing properties are kept and the
 * input is not mutated.
 */
export const withHiddenFiles = (
  options: OpenDialogOptions
): OpenDialogOptions => {
  const properties = options.properties ?? [];
  return {
    ...options,
    properties: properties.includes('showHiddenFiles')
      ? [...properties]
      : [...properties, 'showHiddenFiles'],
  };
};
