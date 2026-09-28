import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Deferred, Effect, Fiber } from 'effect';
import {
  listSteamCompatibilityTools,
  resolveSteamCompatibilityTool,
  type SteamLocation,
  SteamRepository,
  SteamRepositoryLive,
} from '../src/electron/lib/steam-installation.js';
import {
  parseBinaryVdf,
  serializeBinaryVdf,
} from '../src/electron/lib/steam-vdf.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Steam shortcuts repository', () => {
  const createLocation = (): SteamLocation => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ogi-steam-repository-')
    );
    temporaryDirectories.push(directory);
    return {
      root: directory,
      loginUsersPath: path.join(directory, 'config/loginusers.vdf'),
      user: {
        accountId: '1',
        mostRecent: true,
        timestamp: 0,
        userdataPath: directory,
        shortcutsPath: path.join(directory, 'config/shortcuts.vdf'),
      },
    };
  };

  test('serializes complete shortcut transactions across runtimes', async () => {
    const location = createLocation();
    const shortcutsPath = location.user.shortcutsPath;
    const layer = SteamRepositoryLive([]);
    const increment = Effect.gen(function* () {
      const repository = yield* SteamRepository;
      return yield* repository.modifyShortcuts(location, ({ root, commit }) =>
        Effect.gen(function* () {
          const current = root.get('transaction-test');
          const value = current?.type === 2 ? current.value : 0;
          yield* Effect.sleep('20 millis');
          root.set('transaction-test', { type: 2, value: value + 1 });
          yield* commit();
        })
      );
    });
    const run = () => Effect.runPromise(increment.pipe(Effect.provide(layer)));

    await Promise.all([run(), run()]);

    const root = parseBinaryVdf(fs.readFileSync(shortcutsPath));
    expect(root.get('transaction-test')).toEqual({ type: 2, value: 2 });
  });

  test('commits shortcuts and Steam config together', async () => {
    const location = createLocation();
    const layer = SteamRepositoryLive([]);
    const configSource = '"InstallConfigStore"\n{\n}\n';

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SteamRepository;
        yield* repository.modifyShortcuts(
          location,
          ({ root, configPath, commit }) =>
            Effect.gen(function* () {
              root.set('transaction-test', { type: 2, value: 1 });
              yield* commit({ configSource });
              expect(fs.readFileSync(configPath, 'utf8')).toBe(configSource);
            })
        );
      }).pipe(Effect.provide(layer))
    );

    expect(
      parseBinaryVdf(fs.readFileSync(location.user.shortcutsPath)).get(
        'transaction-test'
      )
    ).toEqual({ type: 2, value: 1 });
  });

  test('restores Steam config when the shortcuts write fails', async () => {
    const location = createLocation();
    const layer = SteamRepositoryLive([]);
    const originalConfig = '"existing" "value"\n';
    const configPath = path.join(location.root, 'config/config.vdf');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, originalConfig);

    const result = await Effect.runPromise(
      Effect.either(
        Effect.gen(function* () {
          const repository = yield* SteamRepository;
          yield* repository.modifyShortcuts(
            location,
            ({ root, shortcutsPath, configSource, commit }) =>
              Effect.gen(function* () {
                root.set('transaction-test', { type: 2, value: 1 });
                fs.mkdirSync(shortcutsPath);
                yield* commit({
                  configSource: `${configSource}"changed" "1"\n`,
                });
              })
          );
        }).pipe(Effect.provide(layer))
      )
    );

    expect(result._tag).toBe('Left');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(originalConfig);
  });

  test('rolls back a committed shortcuts file when interrupted', async () => {
    const location = createLocation();
    const layer = SteamRepositoryLive([]);

    await Effect.runPromise(
      Effect.gen(function* () {
        const committed = yield* Deferred.make<void>();
        const repository = yield* SteamRepository;
        const fiber = yield* Effect.fork(
          repository.modifyShortcuts(location, ({ root, commit }) =>
            Effect.gen(function* () {
              root.set('transaction-test', { type: 2, value: 1 });
              yield* commit();
              yield* Deferred.succeed(committed, undefined);
              yield* Effect.never;
            })
          )
        );
        yield* Deferred.await(committed);
        yield* Fiber.interrupt(fiber);
      }).pipe(Effect.provide(layer))
    );

    expect(fs.existsSync(location.user.shortcutsPath)).toBe(false);
  });

  test('rollback removes shortcuts file when it was initially absent', async () => {
    const location = createLocation();
    const layer = SteamRepositoryLive([]);
    const transaction = Effect.gen(function* () {
      const repository = yield* SteamRepository;
      return yield* repository.modifyShortcuts(
        location,
        ({ root, commit, rollback }) =>
          Effect.gen(function* () {
            root.set('transaction-test', { type: 2, value: 1 });
            yield* commit();
            expect(fs.existsSync(location.user.shortcutsPath)).toBe(true);
            yield* rollback;
          })
      );
    });

    await Effect.runPromise(transaction.pipe(Effect.provide(layer)));

    expect(fs.existsSync(location.user.shortcutsPath)).toBe(false);
  });

  test('rollback restores missing Steam config', async () => {
    const location = createLocation();
    const layer = SteamRepositoryLive([]);
    const configPath = path.join(location.root, 'config/config.vdf');

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SteamRepository;
        yield* repository.modifyShortcuts(
          location,
          ({ root, commit, rollback }) =>
            Effect.gen(function* () {
              root.set('transaction-test', { type: 2, value: 1 });
              yield* commit({
                configSource: '"InstallConfigStore"\n{\n}\n',
              });
              expect(fs.existsSync(configPath)).toBe(true);
              yield* rollback;
            })
        );
      }).pipe(Effect.provide(layer))
    );

    expect(fs.existsSync(configPath)).toBe(false);
    expect(fs.existsSync(location.user.shortcutsPath)).toBe(false);
  });

  test('rollback restores an existing shortcuts file', async () => {
    const location = createLocation();
    const original = serializeBinaryVdf(
      new Map([['transaction-test', { type: 2 as const, value: 7 }]])
    );
    fs.mkdirSync(path.dirname(location.user.shortcutsPath), {
      recursive: true,
    });
    fs.writeFileSync(location.user.shortcutsPath, original);
    const layer = SteamRepositoryLive([]);

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SteamRepository;
        yield* repository.modifyShortcuts(
          location,
          ({ root, commit, rollback }) =>
            Effect.gen(function* () {
              root.set('transaction-test', { type: 2, value: 8 });
              yield* commit();
              yield* rollback;
            })
        );
      }).pipe(Effect.provide(layer))
    );

    expect(fs.readFileSync(location.user.shortcutsPath)).toEqual(original);
  });
});

describe('listSteamCompatibilityTools', () => {
  const makeTempDir = (): string => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ogi-compat-tools-')
    );
    temporaryDirectories.push(directory);
    return directory;
  };

  const writeManifest = (
    dir: string,
    id: string,
    displayName: string,
    installPath = '.'
  ): void => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'compatibilitytool.vdf'),
      [
        '"compatibilitytools"',
        '{',
        '\t"compat_tools"',
        '\t{',
        `\t\t"${id}"`,
        '\t\t{',
        `\t\t\t"install_path" "${installPath}"`,
        `\t\t\t"display_name" "${displayName}"`,
        '\t\t}',
        '\t}',
        '}',
      ].join('\n')
    );
  };

  test('lists a root-level manifest named by PROTONPATH', () => {
    const protonPath = makeTempDir();
    writeManifest(protonPath, 'proton-cachyos', 'Proton-CachyOS');

    const tools = listSteamCompatibilityTools([], [protonPath]);

    expect(tools).toEqual([
      {
        id: 'proton-cachyos',
        name: 'Proton-CachyOS',
        installPath: protonPath,
      },
    ]);
  });

  test('lists a tool from a STEAM_EXTRA_COMPAT_TOOLS_PATHS entry', () => {
    const extraRoot = makeTempDir();
    const toolDir = path.join(extraRoot, 'GE-Proton-extra');
    writeManifest(toolDir, 'ge-proton-extra', 'GE-Proton-Extra');

    const tools = listSteamCompatibilityTools([], [extraRoot]);

    expect(tools).toEqual([
      {
        id: 'ge-proton-extra',
        name: 'GE-Proton-Extra',
        installPath: toolDir,
      },
    ]);
  });

  test('follows a symlinked compatibilitytools.d entry and skips a broken link', () => {
    const steamRoot = makeTempDir();
    const customDir = path.join(steamRoot, 'compatibilitytools.d');
    fs.mkdirSync(customDir, { recursive: true });

    const realToolDir = makeTempDir();
    writeManifest(realToolDir, 'linked-tool', 'Linked Tool');
    fs.symlinkSync(realToolDir, path.join(customDir, 'linked-tool'), 'dir');

    const missingTarget = path.join(makeTempDir(), 'does-not-exist');
    fs.symlinkSync(missingTarget, path.join(customDir, 'broken-link'), 'dir');

    const tools = listSteamCompatibilityTools([steamRoot], []);

    expect(tools).toEqual([
      {
        id: 'linked-tool',
        name: 'Linked Tool',
        installPath: path.join(customDir, 'linked-tool'),
      },
    ]);
  });

  test('auto resolves the Nix store Proton-CachyOS over a home-directory copy', () => {
    const storeDir = makeTempDir();
    writeManifest(storeDir, 'proton-cachyos', 'Proton-CachyOS');

    const homeRoot = makeTempDir();
    const homeToolName = 'proton-cachyos-11.0-20260703-slr-x86_64_v3';
    writeManifest(
      path.join(homeRoot, 'compatibilitytools.d', homeToolName),
      homeToolName,
      homeToolName
    );

    const tools = listSteamCompatibilityTools([homeRoot], [storeDir]);

    expect(resolveSteamCompatibilityTool('auto', tools)).toBe('proton-cachyos');
  });
});
