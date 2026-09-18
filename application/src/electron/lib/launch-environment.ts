/**
 * Pure helpers for a game's launch environment and arguments. Nothing here
 * touches Electron, the filesystem or the process environment, so both the
 * UMU handler and the Steam shortcut writer can share one implementation
 * and unit tests can import it directly.
 */

import * as path from 'node:path';
import type { LibraryInfo } from '@ogi-sdk/connect';
import { PlatformError } from '@ogi-sdk/errors';
import {
  type LaunchArgumentToken,
  parseLaunchArgumentTokens,
  resolveLaunchCommandTokens,
} from '@/electron/lib/launch-command.js';

export const KNOWN_LAUNCH_ENV_VARS = new Set([
  'WINEPREFIX',
  'WINEDLLOVERRIDES',
  'STEAM_COMPAT_DATA_PATH',
  'PROTONPATH',
  'GAMEID',
  'STORE',
]);
export const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const UMU_PROTON_PLACEHOLDER = 'umu-proton';
const UMU_PREFIX_BASE_DIRECTORY = '.ogi-wine-prefixes';

/** POSIX single-quote quoting: the result is literal under `/bin/sh`. */
export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function isKnownLaunchEnvAssignment(token: string): boolean {
  const separatorIndex = token.indexOf('=');
  if (separatorIndex <= 0) return false;
  const key = token.slice(0, separatorIndex);
  return KNOWN_LAUNCH_ENV_VARS.has(key);
}

export function stripLeadingLaunchEnvTokens(
  tokens: LaunchArgumentToken[]
): LaunchArgumentToken[] {
  let start = 0;
  while (
    start < tokens.length &&
    ENV_ASSIGNMENT_PATTERN.test(tokens[start].value)
  ) {
    start++;
  }
  return tokens.slice(start);
}

export function normalizeProtonPathValue(
  value?: string | null
): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === UMU_PROTON_PLACEHOLDER) {
    return undefined;
  }
  return normalized;
}

export function parseLeadingLaunchEnvFromArguments(
  launchArguments?: string
): Record<string, string> {
  const env: Record<string, string> = {};
  const tokens = parseLaunchArgumentTokens(launchArguments);
  for (const token of tokens) {
    if (!ENV_ASSIGNMENT_PATTERN.test(token.value)) break;
    const separatorIndex = token.value.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = token.value.slice(0, separatorIndex).trim();
    const value = token.value.slice(separatorIndex + 1).trim();
    if (!key) continue;
    env[key] = value;
  }
  return env;
}

export function parseLaunchArguments(launchArguments?: string): string[] {
  return stripLeadingLaunchEnvTokens(parseLaunchArgumentTokens(launchArguments))
    .map((token) => token.value)
    .filter(
      (token) => token !== '%command%' && !isKnownLaunchEnvAssignment(token)
    );
}

export function parseLaunchArgumentsAfterCommand(
  launchArguments?: string
): string[] {
  const tokens = stripLeadingLaunchEnvTokens(
    parseLaunchArgumentTokens(launchArguments)
  ).filter((token) => !isKnownLaunchEnvAssignment(token.value));
  const commandIndex = tokens.findIndex((token) => token.value === '%command%');
  if (commandIndex === -1) {
    return [];
  }
  return tokens
    .slice(commandIndex + 1)
    .map((token) => token.value)
    .filter((token) => token !== '%command%');
}

export function resolveLaunchCommand(
  launchExecutable: string,
  launchArguments?: string,
  executableArgs: readonly string[] = []
): ReturnType<typeof resolveLaunchCommandTokens> {
  const tokens = stripLeadingLaunchEnvTokens(
    parseLaunchArgumentTokens(launchArguments)
  ).filter((token) => !isKnownLaunchEnvAssignment(token.value));
  return resolveLaunchCommandTokens(launchExecutable, executableArgs, tokens);
}

export function uniqueCaseInsensitive(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

/**
 * Parse WINEDLLOVERRIDES value into an array of override entries.
 * Preserves full override spec when present (e.g. "dinput8=n,b" stays "dinput8=n,b").
 * Entries without "=" (bare DLL names) are left as-is; buildDllOverrides will infer "=n,b".
 */
export function parseDllOverridesValue(rawValue: string): string[] {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) return [];

  const unquotedValue =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
      ? trimmedValue.slice(1, -1)
      : trimmedValue;
  const normalizedValue =
    (unquotedValue.startsWith('\\"') && unquotedValue.endsWith('\\"')) ||
    (unquotedValue.startsWith("\\'") && unquotedValue.endsWith("\\'"))
      ? unquotedValue.slice(2, -2)
      : unquotedValue;

  const entries: string[] = [];
  for (const segment of normalizedValue.split(';')) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) continue;
    const eqIndex = trimmedSegment.indexOf('=');
    if (eqIndex >= 0) {
      const leftSide = trimmedSegment.slice(0, eqIndex).trim();
      const value = trimmedSegment.slice(eqIndex + 1).trim();
      if (!leftSide) continue;
      for (const dllName of leftSide.split(',')) {
        const normalizedDllName = dllName
          .trim()
          .replace(/^\\?['"]/, '')
          .replace(/\\?['"]$/, '');
        if (!normalizedDllName) continue;
        entries.push(`${normalizedDllName}=${value}`);
      }
    } else {
      const normalizedDllName = trimmedSegment
        .replace(/^\\?['"]/, '')
        .replace(/\\?['"]$/, '');
      if (!normalizedDllName) continue;
      entries.push(normalizedDllName);
    }
  }
  return uniqueCaseInsensitive(entries);
}

/**
 * Extract DLL overrides from launch arguments such as:
 * WINEDLLOVERRIDES=dinput8=n,b;dxgi=n,b %command%
 */
export function inferDllOverridesFromLaunchArguments(
  launchArguments?: string
): string[] {
  const tokens = parseLaunchArgumentTokens(launchArguments);
  const dllOverrideAssignment = tokens.find((token) =>
    token.value.startsWith('WINEDLLOVERRIDES=')
  );
  if (!dllOverrideAssignment) {
    return [];
  }

  const rawValue = dllOverrideAssignment.value.slice(
    'WINEDLLOVERRIDES='.length
  );
  return parseDllOverridesValue(rawValue);
}

function inferDllOverridesFromLaunchEnv(launchEnv?: Record<string, string>) {
  const rawValue = launchEnv?.WINEDLLOVERRIDES;
  if (!rawValue) return [];
  return parseDllOverridesValue(rawValue);
}

export function getEffectiveLaunchEnv(
  libraryInfo: Pick<LibraryInfo, 'launchArguments' | 'launchEnv'>
): Record<string, string> {
  const fromLaunchArguments = parseLeadingLaunchEnvFromArguments(
    libraryInfo.launchArguments
  );
  const fromLibraryInfo = libraryInfo.launchEnv || {};
  const merged = { ...fromLaunchArguments, ...fromLibraryInfo };
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (value === undefined || value === null) continue;
    if (normalizedKey === 'PROTONPATH') {
      const protonPath = normalizeProtonPathValue(String(value));
      if (!protonPath) continue;
      sanitized[normalizedKey] = protonPath;
      continue;
    }
    sanitized[normalizedKey] = String(value);
  }
  return sanitized;
}

export function getEffectiveDllOverrides(
  libraryInfo: Pick<LibraryInfo, 'launchArguments' | 'launchEnv' | 'umu'>
): string[] {
  const effectiveLaunchEnv = getEffectiveLaunchEnv(libraryInfo);
  return uniqueCaseInsensitive([
    ...(libraryInfo.umu?.dllOverrides || []),
    ...inferDllOverridesFromLaunchArguments(libraryInfo.launchArguments),
    ...inferDllOverridesFromLaunchEnv(effectiveLaunchEnv),
  ]);
}

/**
 * Convert UMU ID format to GAMEID environment variable value
 * - 'steam:12345' → 'umu-12345'
 * - 'umu:67890' → 'umu-67890'
 */
export function convertUmuId(umuId: string): string {
  if (umuId.startsWith('steam:')) {
    return `umu-${umuId.substring(6)}`;
  }
  if (umuId.startsWith('umu:')) {
    return `umu-${umuId.substring(4)}`;
  }
  // Fallback: assume it's already in the correct format
  return umuId;
}

/** The directory under the user's home that holds every UMU prefix. */
export function getUmuPrefixBaseIn(homeDirectory: string): string {
  return path.join(homeDirectory, UMU_PREFIX_BASE_DIRECTORY);
}

/** The WINEPREFIX path for a game, given the user's home directory. */
export function getUmuWinePrefixIn(
  homeDirectory: string,
  gameId: string
): string {
  const gameIdClean = convertUmuId(gameId).replace('umu-', '');
  return path.join(getUmuPrefixBaseIn(homeDirectory), `umu-${gameIdClean}`);
}

export function getLibraryUmuWinePrefixIn(
  homeDirectory: string,
  libraryInfo: Pick<LibraryInfo, 'umu'>
): string {
  if (!libraryInfo.umu) {
    throw new PlatformError({
      message: 'No UMU configuration found',
      platform: process.platform,
    });
  }
  return (
    libraryInfo.umu.winePrefixPath ??
    getUmuWinePrefixIn(homeDirectory, libraryInfo.umu.umuId)
  );
}

/**
 * Build WINEDLLOVERRIDES string from dllOverrides array.
 * Wine expects DLL names without the .dll extension (e.g., "dinput8=n,b").
 * Only appends "=n,b" when an entry has no override spec (bare DLL name); otherwise preserves the existing spec.
 */
export function buildDllOverrides(dllOverrides: string[]): string {
  if (!dllOverrides || dllOverrides.length === 0) {
    return '';
  }

  const overrides = dllOverrides.map((entry) => {
    const eqIndex = entry.indexOf('=');
    const dllPart =
      eqIndex >= 0 ? entry.slice(0, eqIndex).trim() : entry.trim();
    const dllName = path.basename(dllPart).replace(/\.dll$/i, '');
    if (!dllName) return '';
    if (eqIndex >= 0) {
      const value = entry.slice(eqIndex + 1).trim();
      return value ? `${dllName}=${value}` : `${dllName}=n,b`;
    }
    return `${dllName}=n,b`;
  });

  return overrides.filter(Boolean).join(';');
}
