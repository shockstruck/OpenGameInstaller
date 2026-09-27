import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';

const logger = createLogger(LOGGER_PREFIXES.electron);

/**
 * Winetricks verbs offered by the redistributables repair action.
 * Every entry is confirmed defined (`w_metadata <verb>`) in upstream
 * `Winetricks/winetricks` `src/winetricks` on its default branch:
 *   vcrun2022       - src/winetricks:13858
 *   dotnet48        - src/winetricks:9763
 *   dotnetdesktop6  - src/winetricks:9915
 *   dotnetdesktop8  - src/winetricks:10015
 *   xna40           - src/winetricks:14484
 *   d3dx9           - src/winetricks:6226
 *   d3dcompiler_47  - src/winetricks:6181
 *   physx           - src/winetricks:12237
 */
export const ALLOWED_WINETRICKS_VERBS = [
  'vcrun2022',
  'dotnet48',
  'dotnetdesktop6',
  'dotnetdesktop8',
  'xna40',
  'd3dx9',
  'd3dcompiler_47',
  'physx',
] as const;

export type AllowedWinetricksVerb = (typeof ALLOWED_WINETRICKS_VERBS)[number];

const allowedVerbSet = new Set<string>(ALLOWED_WINETRICKS_VERBS);

export function isAllowedWinetricksVerb(
  verb: string
): verb is AllowedWinetricksVerb {
  return allowedVerbSet.has(verb);
}

/** Drops any verb not on the allowlist, logging each one dropped. */
export function filterAllowedWinetricksVerbs(
  verbs: readonly string[]
): AllowedWinetricksVerb[] {
  const kept: AllowedWinetricksVerb[] = [];
  for (const verb of verbs) {
    if (isAllowedWinetricksVerb(verb)) {
      kept.push(verb);
    } else {
      logger.sync.warn(
        `[redistributables] Dropped unknown winetricks verb: ${verb}`
      );
    }
  }
  return kept;
}

export type RedistributableEntry = { name: string; path: string };

/**
 * Builds the repair list: the game's recorded redistributables, in order,
 * followed by each allowlisted extra verb as a winetricks entry, de-duplicated
 * by `path + name`.
 */
export function buildRepairRedistributableList(
  recorded: readonly RedistributableEntry[],
  extraVerbs: readonly string[]
): RedistributableEntry[] {
  const result: RedistributableEntry[] = [];
  const seen = new Set<string>();

  const add = (entry: RedistributableEntry) => {
    const key = `${entry.path}\u0000${entry.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(entry);
  };

  for (const entry of recorded) add(entry);
  for (const verb of filterAllowedWinetricksVerbs(extraVerbs)) {
    add({ name: verb, path: 'winetricks' });
  }

  return result;
}
