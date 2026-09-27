import type { LibraryInfo } from '@ogi-sdk/connect';
import { formatError, LibraryError, PlatformError } from '@ogi-sdk/errors';
import { Effect } from 'effect';
import { type BrowserWindow } from 'electron';
import {
  addDeckGameToSteam,
  findSteamAppIdForGame,
} from '@/electron/handlers/handler.steam.js';
import {
  installRedistributablesWithUmu,
  migrateToUmu,
  type RedistributableInstallProgress,
} from '@/electron/handlers/handler.umu.js';
import { loadLibraryInfo } from '@/electron/handlers/helpers.app/library.js';
import { isLinux } from '@/electron/handlers/helpers.app/platform.js';
import { buildRepairRedistributableList } from '@/electron/lib/winetricks-verbs.js';
import { sendIPCMessage } from '@/electron/main.js';
import { ipcProcedure, router } from '@/electron/rpc/router-core.js';
import { runEffectBoundary } from '@/electron/runtime.js';
import { ElectronRpc } from '@/lib/electron-rpc.js';

/** appIDs with a repair currently running, guarding against a concurrent second call. */
const repairsInProgress = new Set<number>();

const installRedistributables = (
  mainWindow: BrowserWindow,
  appID: number,
  downloadId?: string
) =>
  Effect.gen(function* () {
    const emitProgress = (progress: RedistributableInstallProgress): void => {
      sendIPCMessage('app:redistributable-progress', {
        appID,
        downloadId,
        ...progress,
      });
    };
    if (!isLinux()) {
      emitProgress({
        kind: 'done',
        total: 0,
        completedCount: 0,
        failedCount: 0,
        overallProgress: 100,
        result: 'failed',
        error: 'Redistributable installation is only supported on Linux',
      });
      return yield* Effect.fail(
        new PlatformError({
          message: 'Redistributable installation is only supported on Linux',
          platform: process.platform,
        })
      );
    }
    const appInfo = loadLibraryInfo(appID) as
      | (LibraryInfo & { redistributables?: { name: string; path: string }[] })
      | null;
    if (!appInfo) {
      emitProgress({
        kind: 'done',
        total: 0,
        completedCount: 0,
        failedCount: 0,
        overallProgress: 100,
        result: 'not-found',
        error: `Game not found for appID ${appID}`,
      });
      return yield* Effect.fail(
        new LibraryError({ message: 'Game not found', gameId: appID })
      );
    }
    if (!appInfo.umu) {
      const steamAppId = yield* findSteamAppIdForGame(appID).pipe(
        Effect.mapError((cause) => {
          emitProgress({
            kind: 'done',
            total: appInfo.redistributables?.length ?? 0,
            completedCount: 0,
            failedCount: appInfo.redistributables?.length ?? 0,
            overallProgress: 100,
            result: 'failed',
            error: 'Failed to inspect the Steam shortcut',
          });
          return new LibraryError({
            message: formatError(cause),
            gameId: appID,
          });
        })
      );
      const migration = yield* Effect.tryPromise({
        try: () => migrateToUmu(appID, steamAppId),
        catch: (cause) =>
          new LibraryError({ message: formatError(cause), gameId: appID }),
      });
      if (!migration.success) {
        const error =
          migration.error ?? 'Failed to migrate legacy prefix to UMU';
        emitProgress({
          kind: 'done',
          total: appInfo.redistributables?.length ?? 0,
          completedCount: 0,
          failedCount: appInfo.redistributables?.length ?? 0,
          overallProgress: 100,
          result: 'failed',
          error,
        });
        return yield* Effect.fail(
          new LibraryError({ message: error, gameId: appID })
        );
      }
    }

    const result = yield* Effect.tryPromise({
      try: () => installRedistributablesWithUmu(appID, emitProgress),
      catch: (cause) =>
        new LibraryError({ message: formatError(cause), gameId: appID }),
    });

    yield* Effect.forkDaemon(addDeckGameToSteam(mainWindow, appID));

    // Redistributable failures are non-fatal: each failure already emitted
    // progress + a warning notification, and the game itself is installed.
    if (result === 'not-found') {
      return yield* Effect.fail(
        new LibraryError({ message: 'Game not found', gameId: appID })
      );
    }
    return result;
  });

export const repairRedistributables = (appID: number, extraVerbs: string[]) =>
  Effect.gen(function* () {
    const emitProgress = (progress: RedistributableInstallProgress): void => {
      sendIPCMessage('app:redistributable-progress', {
        appID,
        ...progress,
      });
    };
    if (!isLinux()) {
      emitProgress({
        kind: 'done',
        total: 0,
        completedCount: 0,
        failedCount: 0,
        overallProgress: 100,
        result: 'failed',
        error: 'Redistributable repair is only supported on Linux',
      });
      return yield* Effect.fail(
        new PlatformError({
          message: 'Redistributable repair is only supported on Linux',
          platform: process.platform,
        })
      );
    }
    const appInfo = loadLibraryInfo(appID) as
      | (LibraryInfo & { redistributables?: { name: string; path: string }[] })
      | null;
    if (!appInfo) {
      emitProgress({
        kind: 'done',
        total: 0,
        completedCount: 0,
        failedCount: 0,
        overallProgress: 100,
        result: 'not-found',
        error: `Game not found for appID ${appID}`,
      });
      return yield* Effect.fail(
        new LibraryError({ message: 'Game not found', gameId: appID })
      );
    }
    if (!appInfo.umu) {
      emitProgress({
        kind: 'done',
        total: 0,
        completedCount: 0,
        failedCount: 0,
        overallProgress: 100,
        result: 'failed',
        error: 'Game is not configured for UMU, cannot repair redistributables',
      });
      return yield* Effect.fail(
        new LibraryError({
          message: 'Game is not configured for UMU',
          gameId: appID,
        })
      );
    }

    if (repairsInProgress.has(appID)) {
      return 'busy' as const;
    }
    repairsInProgress.add(appID);

    return yield* Effect.gen(function* () {
      const redistributables = buildRepairRedistributableList(
        appInfo.redistributables ?? [],
        extraVerbs
      );

      const result = yield* Effect.tryPromise({
        try: () =>
          installRedistributablesWithUmu(appID, emitProgress, redistributables),
        catch: (cause) =>
          new LibraryError({ message: formatError(cause), gameId: appID }),
      });

      if (result === 'not-found') {
        return yield* Effect.fail(
          new LibraryError({ message: 'Game not found', gameId: appID })
        );
      }
      return result;
    }).pipe(
      Effect.ensuring(Effect.sync(() => repairsInProgress.delete(appID)))
    );
  });

export function registerRedistributableHandlers(mainWindow: BrowserWindow) {
  return router(
    ipcProcedure(
      ElectronRpc.app.installRedistributables,
      (_, appID: number, downloadId?: string) =>
        runEffectBoundary(
          installRedistributables(mainWindow, appID, downloadId).pipe(
            Effect.catchTags({
              PlatformError: () => Effect.succeed('failed' as const),
              LibraryError: (error) =>
                Effect.succeed(
                  error.message === 'Game not found'
                    ? ('not-found' as const)
                    : ('failed' as const)
                ),
            })
          )
        )
    ),
    ipcProcedure(
      ElectronRpc.app.repairRedistributables,
      (_, appID: number, extraVerbs: string[]) =>
        runEffectBoundary(
          repairRedistributables(appID, extraVerbs).pipe(
            Effect.catchTags({
              PlatformError: () => Effect.succeed('failed' as const),
              LibraryError: (error) =>
                Effect.succeed(
                  error.message === 'Game not found'
                    ? ('not-found' as const)
                    : ('failed' as const)
                ),
            })
          )
        )
    )
  );
}
