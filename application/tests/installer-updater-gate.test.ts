import { beforeAll, describe, expect, mock, test } from 'bun:test';

mock.module('@/electron/lib/online.js', () => ({
  getEffectiveOnlineState: () => ({ effectiveOnline: true, reason: 'online' }),
}));
mock.module('@/electron/updater.js', () => ({
  checkIfInstallerUpdateAvailable: async () => ({
    success: true,
    updated: false,
  }),
}));
mock.module('@/electron/startup.js', () => ({
  downloadLatestUmu: async () => ({ success: true, updated: false }),
  IS_NIXOS: false,
}));

let shouldRunInstallerUpdater: typeof import('../src/electron/system-updater.js').shouldRunInstallerUpdater;

beforeAll(async () => {
  ({ shouldRunInstallerUpdater } = await import(
    '../src/electron/system-updater.js'
  ));
});

describe('shouldRunInstallerUpdater', () => {
  test('disabled when NixOS is detected', () => {
    expect(shouldRunInstallerUpdater({ isNixos: true })).toBe(false);
  });

  test('disabled when the running binary is a /nix/store path', () => {
    expect(
      shouldRunInstallerUpdater({ execPath: '/nix/store/abc/bin/electron' })
    ).toBe(false);
  });

  test('enabled on a plain Linux install', () => {
    expect(shouldRunInstallerUpdater({ execPath: '/usr/bin/electron' })).toBe(
      true
    );
  });
});
