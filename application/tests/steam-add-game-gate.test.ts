import { describe, expect, test } from 'bun:test';
import { shouldAddGameToSteam } from '../src/electron/lib/steam-installation.js';

describe('add-to-Steam gate', () => {
  test('qualifies any Linux workstation with a detected Steam installation', () => {
    expect(
      shouldAddGameToSteam({ isLinux: true, steamFound: true })
    ).toBe(true);
  });

  test('does not qualify Linux without a detected Steam installation', () => {
    expect(
      shouldAddGameToSteam({ isLinux: true, steamFound: false })
    ).toBe(false);
  });

  test('does not qualify non-Linux platforms even with Steam found', () => {
    expect(
      shouldAddGameToSteam({ isLinux: false, steamFound: true })
    ).toBe(false);
  });

  test('does not qualify non-Linux without Steam', () => {
    expect(
      shouldAddGameToSteam({ isLinux: false, steamFound: false })
    ).toBe(false);
  });
});
