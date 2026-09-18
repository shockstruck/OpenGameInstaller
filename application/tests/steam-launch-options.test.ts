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
  test('a game without UMU and without arguments only sets OGI_GAME_ID and PROTON_LOG', () => {
    expect(expectOptions({})).toBe('OGI_GAME_ID=1 PROTON_LOG=1 %command%');
    expect(expectOptions({ launchArguments: '   ' })).toBe(
      'OGI_GAME_ID=1 PROTON_LOG=1 %command%'
    );
  });

  test('OGI_GAME_ID is always the first token of the environment block', () => {
    const options = expectOptions({ appID: 42 });
    expect(options.startsWith('OGI_GAME_ID=42 ')).toBe(true);
  });

  test('drops a user-supplied OGI_GAME_ID override rather than letting it win', () => {
    // SHOC-452 design: OGI reserves this key, so a launchEnv entry with the
    // same name is dropped (and warned about) instead of overriding ours or
    // appearing twice.
    expect(
      expectOptions({ appID: 7, launchEnv: { OGI_GAME_ID: '999' } })
    ).toBe('OGI_GAME_ID=7 PROTON_LOG=1 %command%');
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
        'OGI_GAME_ID=12345',
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
    ).toBe(
      'OGI_GAME_ID=1 DXVK_HUD=0 PROTONPATH=GE-Proton9-20 PROTON_LOG=1 %command%'
    );
  });

  test('derives the default prefix from the UMU id', () => {
    expect(expectOptions({ umu: { umuId: 'steam:123' } })).toBe(
      `OGI_GAME_ID=1 PROTON_LOG=1 STEAM_COMPAT_DATA_PATH=${home}/.ogi-wine-prefixes/umu-123 WINEPREFIX=${home}/.ogi-wine-prefixes/umu-123 %command%`
    );
    expect(expectOptions({ umu: { umuId: 'umu:abc' } })).toBe(
      `OGI_GAME_ID=1 PROTON_LOG=1 STEAM_COMPAT_DATA_PATH=${home}/.ogi-wine-prefixes/umu-abc WINEPREFIX=${home}/.ogi-wine-prefixes/umu-abc %command%`
    );
  });

  test('quotes a prefix path containing a space', () => {
    expect(
      expectOptions({
        umu: { umuId: 'umu:abc', winePrefixPath: '/home/kevin/My Games/pfx' },
      })
    ).toBe(
      "OGI_GAME_ID=1 PROTON_LOG=1 STEAM_COMPAT_DATA_PATH='/home/kevin/My Games/pfx' WINEPREFIX='/home/kevin/My Games/pfx' %command%"
    );
  });

  test('a configured prefix path does not need a home directory', () => {
    expect(
      expectOptions({ umu: { umuId: 'umu:abc', winePrefixPath: '/pfx' } }, null)
    ).toBe(
      'OGI_GAME_ID=1 PROTON_LOG=1 STEAM_COMPAT_DATA_PATH=/pfx WINEPREFIX=/pfx %command%'
    );
    expect(expectError({ umu: { umuId: 'umu:abc' } }, null).key).toBe(
      'WINEPREFIX'
    );
  });

  test('arguments without %command% follow it', () => {
    expect(expectOptions({ launchArguments: '--windowed' })).toBe(
      'OGI_GAME_ID=1 PROTON_LOG=1 %command% --windowed'
    );
    expect(
      expectOptions({ launchArguments: '-config "my config.cfg" --fps 60' })
    ).toBe(
      "OGI_GAME_ID=1 PROTON_LOG=1 %command% -config 'my config.cfg' --fps 60"
    );
  });

  test('only arguments after %command% are kept when it is present', () => {
    expect(
      expectOptions({ launchArguments: 'gamemoderun %command% --windowed' })
    ).toBe('OGI_GAME_ID=1 PROTON_LOG=1 %command% --windowed');
  });

  test('known launch variables in the arguments are not passed as arguments', () => {
    expect(
      expectOptions({
        launchArguments: '--foo WINEPREFIX=/elsewhere GAMEID=umu-1 --bar',
      })
    ).toBe('OGI_GAME_ID=1 PROTON_LOG=1 %command% --foo --bar');
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
      `OGI_GAME_ID=1 A='say "hi"' B='it'\\''s' C='$HOME/\`x\`\\y;z' D='' PROTON_LOG=1 %command%`
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
