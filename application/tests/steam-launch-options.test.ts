import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import {
  buildDirectSteamLaunchOptions,
  type DirectSteamLaunchInput,
} from '../src/electron/handlers/helpers.app/steam-launch-options.js';

const home = '/home/kevin';

const build = (
  appInfo: Partial<DirectSteamLaunchInput>,
  homeDirectory: string | null = home
) =>
  Effect.runSync(
    Effect.either(
      buildDirectSteamLaunchOptions({ appID: 1, ...appInfo }, { homeDirectory })
    )
  );

const expectOptions = (
  appInfo: Partial<DirectSteamLaunchInput>,
  homeDirectory: string | null = home
): string => {
  const result = build(appInfo, homeDirectory);
  if (result._tag === 'Left') throw result.left;
  return result.right;
};

const expectError = (
  appInfo: Partial<DirectSteamLaunchInput>,
  homeDirectory: string | null = home
) => {
  const result = build(appInfo, homeDirectory);
  if (result._tag === 'Right') {
    throw new Error(`expected a failure, got ${result.right}`);
  }
  return result.left;
};

describe('buildDirectSteamLaunchOptions', () => {
  test('a game without UMU and without arguments only sets PROTON_LOG', () => {
    expect(expectOptions({})).toBe('PROTON_LOG=1 %command%');
    expect(expectOptions({ launchArguments: '   ' })).toBe(
      'PROTON_LOG=1 %command%'
    );
  });

  test('reproduces the wrapper environment for a UMU game', () => {
    // The SHOC-430 fixture: DLL overrides from all three sources, a
    // `umu-proton` placeholder to drop, a leading env token and %command%.
    const options = expectOptions({
      appID: 12345,
      launchArguments:
        'DXVK_HUD=fps WINEDLLOVERRIDES="dxgi=n,b;d3d11" %command% --skip-intro',
      launchEnv: { PROTONPATH: 'umu-proton', WINEDLLOVERRIDES: 'DXGI=n,b' },
      umu: { umuId: 'steam:123', dllOverrides: ['dinput8', 'version=n'] },
    });
    const prefix = `${home}/.ogi-wine-prefixes/umu-123`;
    expect(options).toBe(
      [
        'DXVK_HUD=fps',
        'PROTON_LOG=1',
        `STEAM_COMPAT_DATA_PATH=${prefix}`,
        `WINEPREFIX=${prefix}`,
        "WINEDLLOVERRIDES='dinput8=n,b;version=n;dxgi=n,b;d3d11=n,b'",
        '%command%',
        '--skip-intro',
      ].join(' ')
    );
  });

  test('keeps a real PROTONPATH and lets launchEnv override argument tokens', () => {
    expect(
      expectOptions({
        launchArguments: 'DXVK_HUD=fps %command%',
        launchEnv: { DXVK_HUD: '0', PROTONPATH: ' GE-Proton9-20 ' },
      })
    ).toBe('DXVK_HUD=0 PROTONPATH=GE-Proton9-20 PROTON_LOG=1 %command%');
  });

  test('derives the default prefix from the UMU id', () => {
    expect(expectOptions({ umu: { umuId: 'steam:123' } })).toBe(
      `PROTON_LOG=1 STEAM_COMPAT_DATA_PATH=${home}/.ogi-wine-prefixes/umu-123 WINEPREFIX=${home}/.ogi-wine-prefixes/umu-123 %command%`
    );
    expect(expectOptions({ umu: { umuId: 'umu:abc' } })).toBe(
      `PROTON_LOG=1 STEAM_COMPAT_DATA_PATH=${home}/.ogi-wine-prefixes/umu-abc WINEPREFIX=${home}/.ogi-wine-prefixes/umu-abc %command%`
    );
  });

  test('quotes a prefix path containing a space', () => {
    expect(
      expectOptions({
        umu: { umuId: 'umu:abc', winePrefixPath: '/home/kevin/My Games/pfx' },
      })
    ).toBe(
      "PROTON_LOG=1 STEAM_COMPAT_DATA_PATH='/home/kevin/My Games/pfx' WINEPREFIX='/home/kevin/My Games/pfx' %command%"
    );
  });

  test('a configured prefix path does not need a home directory', () => {
    expect(
      expectOptions({ umu: { umuId: 'umu:abc', winePrefixPath: '/pfx' } }, null)
    ).toBe(
      'PROTON_LOG=1 STEAM_COMPAT_DATA_PATH=/pfx WINEPREFIX=/pfx %command%'
    );
    expect(expectError({ umu: { umuId: 'umu:abc' } }, null).key).toBe(
      'WINEPREFIX'
    );
  });

  test('arguments without %command% follow it', () => {
    expect(expectOptions({ launchArguments: '--windowed' })).toBe(
      'PROTON_LOG=1 %command% --windowed'
    );
    expect(
      expectOptions({ launchArguments: '-config "my config.cfg" --fps 60' })
    ).toBe("PROTON_LOG=1 %command% -config 'my config.cfg' --fps 60");
  });

  test('only arguments after %command% are kept when it is present', () => {
    expect(
      expectOptions({ launchArguments: 'gamemoderun %command% --windowed' })
    ).toBe('PROTON_LOG=1 %command% --windowed');
  });

  test('known launch variables in the arguments are not passed as arguments', () => {
    expect(
      expectOptions({
        launchArguments: '--foo WINEPREFIX=/elsewhere GAMEID=umu-1 --bar',
      })
    ).toBe('PROTON_LOG=1 %command% --foo --bar');
  });

  test('quotes shell-significant characters so the value stays literal', () => {
    expect(
      expectOptions({
        launchEnv: {
          A: 'say "hi"',
          B: "it's",
          C: '$HOME/`x`\\y;z',
          D: '',
        },
      })
    ).toBe(
      `A='say "hi"' B='it'\\''s' C='$HOME/\`x\`\\y;z' D='' PROTON_LOG=1 %command%`
    );
  });

  test('rejects values and arguments that cannot be written to a shortcut', () => {
    expect(expectError({ launchEnv: { A: 'one\ntwo' } }).key).toBe('A');
    expect(expectError({ launchEnv: { 'BAD-KEY': 'x' } }).key).toBe('BAD-KEY');
    const argumentError = expectError({
      launchArguments: '%command% "line\nbreak"',
    });
    expect(argumentError._tag).toBe('SteamLaunchOptionsError');
    expect(argumentError.key).toBe('launchArguments');
    expect(argumentError.gameId).toBe(1);
  });
});
