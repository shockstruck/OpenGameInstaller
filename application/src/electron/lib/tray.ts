import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';
import { app, type BrowserWindow, Menu, Tray } from 'electron';
import { join } from 'path';

const logger = createLogger(LOGGER_PREFIXES.electron);

let tray: Tray | null = null;

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
