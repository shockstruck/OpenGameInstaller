export type ShouldHideOnCloseArgs = {
  isQuitting: boolean;
  trayAvailable: boolean;
  gamescope: boolean;
};

/**
 * Whether a main-window 'close' should hide the window instead of letting it
 * close. Gamescope always closes normally; a real quit (tray Quit or
 * before-quit) always closes normally; otherwise a window with a tray hides.
 */
export function shouldHideOnClose({
  isQuitting,
  trayAvailable,
  gamescope,
}: ShouldHideOnCloseArgs): boolean {
  if (gamescope || isQuitting) return false;
  return trayAvailable;
}

/** Parse the `--hidden` CLI flag used to start OGI without showing its window. */
export function parseHiddenFlag(
  argv: readonly string[] = process.argv
): boolean {
  return argv.includes('--hidden');
}
