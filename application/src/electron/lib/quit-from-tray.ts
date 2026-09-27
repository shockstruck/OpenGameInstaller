export type WindowLike = {
  isDestroyed: () => boolean;
  close: () => void;
};

export type QuitFromTrayOptions = {
  setQuitting: () => void;
  getWindows: () => readonly WindowLike[];
  quit: () => void;
};

/**
 * Quit from the tray's "Quit" item. Closing every open window (rather than
 * calling `quit` directly) lets `window-all-closed`'s existing handler run
 * the torrent/addon/addon-server cleanup — the same path a normal window
 * close takes when there is no tray. `setQuitting` runs first so each
 * window's `close` handler sees `isQuitting` and lets the close through
 * instead of hiding to the tray again. With no open window, `window-all-closed`
 * will never fire, so this falls back to `quit` directly.
 */
export function quitFromTray({
  setQuitting,
  getWindows,
  quit,
}: QuitFromTrayOptions): void {
  setQuitting();

  const windows = getWindows().filter((win) => !win.isDestroyed());
  if (windows.length === 0) {
    quit();
    return;
  }

  for (const win of windows) {
    win.close();
  }
}
