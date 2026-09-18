import { formatError, UpdateError } from '@ogi-sdk/errors';
import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';
import { Effect } from 'effect';
import { getEffectiveOnlineState } from '@/electron/lib/online.js';
import { downloadLatestUmu, IS_NIXOS } from '@/electron/startup.js';
import {
  checkIfInstallerUpdateAvailable,
  type UpdaterCallbacks,
} from '@/electron/updater.js';

const logger = createLogger(LOGGER_PREFIXES.electron);

export type SystemUpdateResult = {
  id: string;
  success: boolean;
  updated?: boolean;
  /** Stop startup and close the app after this updater finishes. */
  shutdownRequired?: boolean;
  error?: string;
};

export function requiresSystemUpdateShutdown(
  results: readonly SystemUpdateResult[]
): boolean {
  return results.some((result) => result.shutdownRequired === true);
}

export interface SystemUpdater {
  id: string;
  label: string;
  shouldRun(): Effect.Effect<boolean, UpdateError>;
  update(
    callbacks: UpdaterCallbacks
  ): Effect.Effect<SystemUpdateResult, UpdateError>;
}

export class SystemUpdateManager {
  private updaters: SystemUpdater[] = [];

  constructor(updaters: SystemUpdater[] = []) {
    this.updaters = [...updaters];
  }

  register(updater: SystemUpdater): void {
    this.updaters.push(updater);
  }

  updateOnlineSystem(
    callbacks: UpdaterCallbacks
  ): Effect.Effect<SystemUpdateResult[]> {
    return Effect.gen(this, function* () {
      const onlineState = getEffectiveOnlineState();
      if (!onlineState.effectiveOnline) {
        logger.sync.info(
          `[system-updater] Offline mode enabled (${onlineState.reason}), skipping updates`
        );
        return [];
      }

      const results: SystemUpdateResult[] = [];
      for (const updater of this.updaters) {
        const shouldRun = yield* updater.shouldRun().pipe(
          Effect.catchAll((error) => {
            logger.sync.error(
              `[system-updater] Could not determine whether ${updater.id} should run:`,
              error
            );
            results.push({
              id: updater.id,
              success: false,
              error: error.message,
            });
            return Effect.succeed(false);
          })
        );
        if (!shouldRun) {
          logger.sync.info(`[system-updater] Skipping ${updater.id}`);
          continue;
        }

        callbacks.onStatus(`Checking ${updater.label} updates...`);
        const result = yield* updater.update(callbacks).pipe(
          Effect.catchAll((error) => {
            logger.sync.error(`[system-updater] ${updater.id} failed:`, error);
            return Effect.succeed<SystemUpdateResult>({
              id: updater.id,
              success: false,
              error: error.message,
            });
          })
        );
        results.push(result);
        if (result.shutdownRequired) {
          break;
        }
      }

      return results;
    });
  }
}

const NIX_STORE_PREFIX = '/nix/store/';

/**
 * The installer updater replaces the running Setup AppImage in place, which
 * has no meaning on an immutable NixOS install (there is no AppImage next to
 * a `/nix/store` binary to replace). Gate on both the detected OS and the
 * running binary's path so a NixOS-built package is caught even before
 * `IS_NIXOS` detection has run.
 */
export function shouldRunInstallerUpdater(
  params: { isNixos?: boolean; execPath?: string } = {}
): boolean {
  const { isNixos = false, execPath = process.execPath } = params;
  return !isNixos && !execPath.startsWith(NIX_STORE_PREFIX);
}

export class SetupAppImageUpdater implements SystemUpdater {
  id = 'setup-appimage';
  label = 'installer';

  shouldRun(): Effect.Effect<boolean> {
    const allowed = shouldRunInstallerUpdater({
      isNixos: IS_NIXOS,
      execPath: process.execPath,
    });
    if (!allowed) {
      logger.sync.info('installer updater disabled: immutable install');
    }
    return Effect.succeed(allowed);
  }

  update(
    callbacks: UpdaterCallbacks
  ): Effect.Effect<SystemUpdateResult, UpdateError> {
    return Effect.tryPromise({
      try: () => checkIfInstallerUpdateAvailable(callbacks),
      catch: (cause) =>
        new UpdateError({
          message: `Failed to check installer updates: ${formatError(cause)}`,
          cause,
        }),
    }).pipe(
      Effect.map((result) => ({
        id: this.id,
        success: result.success,
        updated: result.updated,
        shutdownRequired: result.updated,
        error: result.error,
      }))
    );
  }
}

export class UmuLauncherUpdater implements SystemUpdater {
  id = 'umu-launcher';
  label = 'UMU launcher';

  shouldRun(): Effect.Effect<boolean> {
    return Effect.succeed(process.platform === 'linux');
  }

  update(): Effect.Effect<SystemUpdateResult, UpdateError> {
    return Effect.tryPromise({
      try: () => downloadLatestUmu(),
      catch: (cause) =>
        new UpdateError({
          message: `Failed to update UMU launcher: ${formatError(cause)}`,
          cause,
        }),
    }).pipe(
      Effect.map((result) => ({
        id: this.id,
        success: result.success,
        updated: result.updated,
        error: result.error,
      }))
    );
  }
}

export function createDefaultSystemUpdateManager(): SystemUpdateManager {
  return new SystemUpdateManager([
    new SetupAppImageUpdater(),
    new UmuLauncherUpdater(),
  ]);
}
