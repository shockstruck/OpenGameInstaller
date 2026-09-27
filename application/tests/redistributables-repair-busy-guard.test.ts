import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { Effect } from 'effect';

const sendIPCMessage = mock(() => {});
const addDeckGameToSteam = mock(() => Effect.void);
const findSteamAppIdForGame = mock(() => Effect.succeed(0));
const migrateToUmu = mock(() =>
  Promise.resolve({ success: true } as { success: boolean; error?: string })
);

let loadLibraryInfoImpl: (appID: number) => unknown = () => null;
const loadLibraryInfo = mock((appID: number) => loadLibraryInfoImpl(appID));

let installRedistributablesWithUmuImpl: (
  appID: number,
  reportProgress?: unknown,
  redistributablesOverride?: { name: string; path: string }[]
) => Promise<'success' | 'partial' | 'failed' | 'not-found'> = () =>
  Promise.resolve('success');
const installRedistributablesWithUmu = mock(
  (
    appID: number,
    reportProgress?: unknown,
    redistributablesOverride?: { name: string; path: string }[]
  ) =>
    installRedistributablesWithUmuImpl(
      appID,
      reportProgress,
      redistributablesOverride
    )
);

class MockBrowserWindow {}

mock.module('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: MockBrowserWindow,
}));
mock.module('@/electron/main.js', () => ({ sendIPCMessage }));
mock.module('@/electron/handlers/handler.steam.js', () => ({
  addDeckGameToSteam,
  findSteamAppIdForGame,
}));
mock.module('@/electron/handlers/handler.umu.js', () => ({
  installRedistributablesWithUmu,
  migrateToUmu,
}));
mock.module('@/electron/handlers/helpers.app/library.js', () => ({
  ...require('../src/electron/handlers/helpers.app/library.js'),
  loadLibraryInfo,
}));

let repairRedistributables: typeof import('../src/electron/handlers/handler.redists.js').repairRedistributables;

beforeAll(async () => {
  ({ repairRedistributables } = await import(
    '../src/electron/handlers/handler.redists.js'
  ));
});

afterEach(() => {
  sendIPCMessage.mockClear();
  loadLibraryInfo.mockClear();
  installRedistributablesWithUmu.mockClear();
  loadLibraryInfoImpl = () => null;
  installRedistributablesWithUmuImpl = () => Promise.resolve('success');
});

const gameWithUmu = (redistributables?: { name: string; path: string }[]) => ({
  appID: 7,
  name: 'Test Game',
  umu: { umuId: 'umu:7' },
  redistributables,
});

describe('repairRedistributables busy guard', () => {
  test('a second concurrent call returns busy without spawning anything', async () => {
    loadLibraryInfoImpl = () => gameWithUmu();
    let releaseFirstCall: (() => void) | undefined;
    const firstCallStarted = new Promise<void>((resolve) => {
      installRedistributablesWithUmuImpl = () =>
        new Promise((resolve2) => {
          resolve();
          releaseFirstCall = () => resolve2('success');
        });
    });

    const firstCall = Effect.runPromise(repairRedistributables(7, []));
    await firstCallStarted;

    const secondResult = await Effect.runPromise(repairRedistributables(7, []));
    expect(secondResult).toBe('busy');
    expect(installRedistributablesWithUmu).toHaveBeenCalledTimes(1);

    releaseFirstCall?.();
    expect(await firstCall).toBe('success');
  });

  test('the guard is released after a successful run, allowing a later call', async () => {
    loadLibraryInfoImpl = () => gameWithUmu();
    installRedistributablesWithUmuImpl = () => Promise.resolve('success');

    expect(await Effect.runPromise(repairRedistributables(7, []))).toBe(
      'success'
    );
    expect(await Effect.runPromise(repairRedistributables(7, []))).toBe(
      'success'
    );
    expect(installRedistributablesWithUmu).toHaveBeenCalledTimes(2);
  });

  test('the guard is released after a thrown failure', async () => {
    loadLibraryInfoImpl = () => gameWithUmu();
    installRedistributablesWithUmuImpl = () =>
      Promise.reject(new Error('spawn failed'));

    const failedResult = await Effect.runPromise(
      Effect.either(repairRedistributables(7, []))
    );
    expect(failedResult._tag).toBe('Left');

    installRedistributablesWithUmuImpl = () => Promise.resolve('success');
    expect(await Effect.runPromise(repairRedistributables(7, []))).toBe(
      'success'
    );
    expect(installRedistributablesWithUmu).toHaveBeenCalledTimes(2);
  });
});

describe('repairRedistributables list assembly', () => {
  test('passes the recorded redistributables plus allowlisted extra verbs as the override', async () => {
    loadLibraryInfoImpl = () =>
      gameWithUmu([
        { name: 'installer.exe', path: '/games/foo/installer.exe' },
      ]);
    installRedistributablesWithUmuImpl = () => Promise.resolve('success');

    await Effect.runPromise(
      repairRedistributables(7, ['vcrun2022', 'not-a-real-verb'])
    );

    expect(installRedistributablesWithUmu.mock.calls[0]?.[2]).toEqual([
      { name: 'installer.exe', path: '/games/foo/installer.exe' },
      { name: 'vcrun2022', path: 'winetricks' },
    ]);
  });
});
