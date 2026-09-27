import { describe, expect, test } from 'bun:test';
import {
  ALLOWED_WINETRICKS_VERBS,
  buildRepairRedistributableList,
  filterAllowedWinetricksVerbs,
  isAllowedWinetricksVerb,
} from '../src/electron/lib/winetricks-verbs.js';

describe('winetricks verb allowlist', () => {
  test('keeps every allowlisted verb', () => {
    expect(filterAllowedWinetricksVerbs([...ALLOWED_WINETRICKS_VERBS])).toEqual(
      [...ALLOWED_WINETRICKS_VERBS]
    );
  });

  test('drops unknown verbs', () => {
    expect(
      filterAllowedWinetricksVerbs(['vcrun2022', 'not-a-real-verb', 'dotnet48'])
    ).toEqual(['vcrun2022', 'dotnet48']);
  });

  test('returns an empty list for empty input', () => {
    expect(filterAllowedWinetricksVerbs([])).toEqual([]);
  });

  test('isAllowedWinetricksVerb rejects an unknown verb', () => {
    expect(isAllowedWinetricksVerb('vcrun2022')).toBe(true);
    expect(isAllowedWinetricksVerb('some-made-up-verb')).toBe(false);
  });
});

describe('repair redistributable list building', () => {
  test('keeps the recorded order and appends allowlisted extra verbs', () => {
    const recorded = [
      { name: 'installer.exe', path: '/games/foo/installer.exe' },
      { name: 'dotnet48', path: 'winetricks' },
    ];

    expect(buildRepairRedistributableList(recorded, ['vcrun2022'])).toEqual([
      { name: 'installer.exe', path: '/games/foo/installer.exe' },
      { name: 'dotnet48', path: 'winetricks' },
      { name: 'vcrun2022', path: 'winetricks' },
    ]);
  });

  test('de-duplicates by path + name, keeping the first occurrence', () => {
    const recorded = [
      { name: 'dotnet48', path: 'winetricks' },
      { name: 'installer.exe', path: '/games/foo/installer.exe' },
    ];

    expect(
      buildRepairRedistributableList(recorded, [
        'dotnet48',
        'vcrun2022',
        'dotnet48',
      ])
    ).toEqual([
      { name: 'dotnet48', path: 'winetricks' },
      { name: 'installer.exe', path: '/games/foo/installer.exe' },
      { name: 'vcrun2022', path: 'winetricks' },
    ]);
  });

  test('drops unknown extra verbs while keeping the recorded list', () => {
    const recorded = [
      { name: 'installer.exe', path: '/games/foo/installer.exe' },
    ];

    expect(
      buildRepairRedistributableList(recorded, ['not-a-real-verb'])
    ).toEqual(recorded);
  });

  test('returns an empty list when nothing is recorded and no verbs are requested', () => {
    expect(buildRepairRedistributableList([], [])).toEqual([]);
  });
});
