import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';
import { app, type BrowserWindow, Menu, Tray } from 'electron';
import { join } from 'path';
import { createTrailingThrottle } from '@/electron/lib/tray-status-throttle.js';

const logger = createLogger(LOGGER_PREFIXES.electron);

let tray: Tray | null = null;

const TRAY_STATUS_THROTTLE_MS = 2000;

const applyTrayStatus = createTrailingThrottle((text) => {
  tray?.setToolTip(text);
}, TRAY_STATUS_THROTTLE_MS);

/**
 * Update the tray icon's tooltip with the current activity status, e.g. what
 * is downloading and its progress. Throttled to at most one native call per
 * `TRAY_STATUS_THROTTLE_MS`; a no-op when there is no tray icon (gamescope).
 */
export function setTrayStatus(text: string): void {
  if (!tray) return;
  applyTrayStatus(text);
}

/** Whether a tray icon currently exists for this process. */
export function isTrayAvailable(): boolean {
  return tray !== null;
}

export type CreateAppTrayOptions = {
  getWindow: () => BrowserWindow | null;
  onQuit: () => void;
};

/**
 * Create the app's tray icon, if one doesn't already exist. Returns the
 * existing tray unchanged if called twice, since a second window created by
 * the app (e.g. a Steam-shortcut launch) must not spawn a second icon.
 */
export function createAppTray({
  getWindow,
  onQuit,
}: CreateAppTrayOptions): Tray {
  if (tray) return tray;

  tray = new Tray(join(app.getAppPath(), 'public/favicon-256x256.png'));
  tray.setToolTip('OpenGameInstaller');

  const showWindow = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
  };

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show OpenGameInstaller', click: showWindow },
      { label: 'Quit', click: onQuit },
    ])
  );
  tray.on('click', showWindow);

  logger.sync.info('[tray] Tray icon created');
  return tray;
}
