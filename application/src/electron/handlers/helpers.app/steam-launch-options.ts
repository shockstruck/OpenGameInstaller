/**
 * Builds the LaunchOptions string for a Linux Steam shortcut whose `Exe` is
 * the game itself. Steam runs launch options through `/bin/sh -c` with
 * `%command%` replaced by its own launcher chain (reaper → Steam Linux
 * Runtime → Proton → game), so `VAR=value … %command% args` applies the
 * environment to that whole chain without any process of ours in between.
 *
 * The environment and arguments are the ones the in-app wrapper computes for
 * a Steam launch, in the same order; see `executeWrapperCommandForAppSteam`.
 */

import type { LibraryInfo } from '@ogi-sdk/connect';
import { SteamLaunchOptionsError } from '@ogi-sdk/errors';
import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';
import { Effect } from 'effect';
import { parseLaunchArgumentTokens } from '@/electron/lib/launch-command.js';
import {
  buildDllOverrides,
  getEffectiveDllOverrides,
  getEffectiveLaunchEnv,
  getLibraryUmuWinePrefixIn,
  parseLaunchArguments,
  parseLaunchArgumentsAfterCommand,
  shellQuote,
} from '@/electron/lib/launch-environment.js';

const logger = createLogger(LOGGER_PREFIXES.electron);

/** Reserved: carries the OGI game id so a re-sync can re-claim its own shortcut. */
const OGI_GAME_ID_KEY = 'OGI_GAME_ID';

export type DirectSteamLaunchInput = Pick<
  LibraryInfo,
  'appID' | 'launchArguments' | 'launchEnv' | 'umu'
>;

export type DirectSteamLaunchOptions = {
  /** The user's home directory, used for the default UMU prefix location. */
  homeDirectory: string | null;
};

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Characters that survive `/bin/sh` word splitting and expansion unquoted.
const SAFE_WORD_PATTERN = /^[A-Za-z0-9_@%+=:,./-]+$/;
const UNSAFE_VALUE_PATTERN = /[\0\r\n]/;

const quoteWord = (value: string): string =>
  SAFE_WORD_PATTERN.test(value) ? value : shellQuote(value);

/**
 * The arguments the wrapper passes after the game: everything after
 * `%command%` when present, otherwise every non-environment token.
 */
export function directSteamLaunchArguments(launchArguments?: string): string[] {
  const hasCommand = parseLaunchArgumentTokens(launchArguments).some(
    (token) => token.value === '%command%'
  );
  return hasCommand
    ? parseLaunchArgumentsAfterCommand(launchArguments)
    : parseLaunchArguments(launchArguments);
}

export function buildDirectSteamLaunchOptions(
  appInfo: DirectSteamLaunchInput,
  options: DirectSteamLaunchOptions
): Effect.Effect<string, SteamLaunchOptionsError> {
  return Effect.gen(function* () {
    const fail = (key: string, message: string) =>
      Effect.fail(
        new SteamLaunchOptionsError({ message, gameId: appInfo.appID, key })
      );

    const environment = new Map<string, string>();
    environment.set(OGI_GAME_ID_KEY, String(appInfo.appID));
    for (const [key, value] of Object.entries(getEffectiveLaunchEnv(appInfo))) {
      if (key === OGI_GAME_ID_KEY) {
        yield* logger.warn(
          `Ignoring user-supplied ${OGI_GAME_ID_KEY} launch environment variable for game ${appInfo.appID}: this key is reserved by OpenGameInstaller to re-claim its own Steam shortcut`
        );
        continue;
      }
      environment.set(key, value);
    }
    environment.set('PROTON_LOG', '1');
    if (appInfo.umu) {
      if (!appInfo.umu.winePrefixPath && !options.homeDirectory) {
        return yield* fail(
          'WINEPREFIX',
          'Cannot determine the home directory for the UMU prefix'
        );
      }
      const winePrefix = getLibraryUmuWinePrefixIn(
        options.homeDirectory ?? '',
        appInfo
      );
      // Same values the wrapper applies over the user's environment; moved
      // to the end so the string reads in the documented order.
      for (const key of ['STEAM_COMPAT_DATA_PATH', 'WINEPREFIX']) {
        environment.delete(key);
        environment.set(key, winePrefix);
      }
      const dllOverrides = buildDllOverrides(getEffectiveDllOverrides(appInfo));
      if (dllOverrides) {
        environment.delete('WINEDLLOVERRIDES');
        environment.set('WINEDLLOVERRIDES', dllOverrides);
      }
    }

    const parts: string[] = [];
    for (const [key, value] of environment) {
      if (!ENV_KEY_PATTERN.test(key)) {
        return yield* fail(
          key,
          `Launch environment variable "${key}" is not a valid shell variable name`
        );
      }
      if (UNSAFE_VALUE_PATTERN.test(value)) {
        return yield* fail(
          key,
          `Launch environment variable "${key}" contains a line break and cannot be written to a Steam shortcut`
        );
      }
      parts.push(`${key}=${quoteWord(value)}`);
    }

    parts.push('%command%');
    for (const argument of directSteamLaunchArguments(
      appInfo.launchArguments
    )) {
      if (UNSAFE_VALUE_PATTERN.test(argument)) {
        return yield* fail(
          'launchArguments',
          'A launch argument contains a line break and cannot be written to a Steam shortcut'
        );
      }
      parts.push(quoteWord(argument));
    }
    return parts.join(' ');
  });
}
