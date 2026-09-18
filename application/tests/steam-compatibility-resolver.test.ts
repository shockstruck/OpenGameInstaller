import { describe, expect, test } from 'bun:test';
import {
  resolveSteamCompatibilityTool,
  type SteamCompatibilityTool,
} from '../src/electron/lib/steam-installation.js';

const tool = (
  id: string,
  name: string,
  installPath = `/tools/${id}`
): SteamCompatibilityTool => ({ id, name, installPath });

describe('resolveSteamCompatibilityTool', () => {
  test('prefers the Nix-packaged Proton-CachyOS tool by exact id/name', () => {
    const tools = [
      tool('proton_experimental', 'Proton - Experimental'),
      tool('Proton-CachyOS', 'Proton-CachyOS'),
      tool('GE-Proton10-4', 'GE-Proton10-4'),
    ];
    expect(resolveSteamCompatibilityTool('auto', tools)).toBe('Proton-CachyOS');
  });

  test('prefers the x86_64_v3 CachyOS build over other architectures', () => {
    const tools = [
      tool(
        'proton-cachyos-11.0-20260703-slr-x86_64_v4',
        'proton-cachyos-11.0-20260703-slr-x86_64_v4'
      ),
      tool(
        'proton-cachyos-11.0-20260703-slr-x86_64',
        'proton-cachyos-11.0-20260703-slr-x86_64'
      ),
      tool(
        'proton-cachyos-11.0-20260703-slr-x86_64_v3',
        'proton-cachyos-11.0-20260703-slr-x86_64_v3'
      ),
    ];
    expect(resolveSteamCompatibilityTool('auto', tools)).toBe(
      'proton-cachyos-11.0-20260703-slr-x86_64_v3'
    );
  });

  test('falls back to proton_experimental when no CachyOS build is installed', () => {
    const tools = [
      tool('GE-Proton10-4', 'GE-Proton10-4'),
      tool('proton_experimental', 'Proton - Experimental'),
    ];
    expect(resolveSteamCompatibilityTool('auto', tools)).toBe(
      'proton_experimental'
    );
  });

  test('falls back to the highest-versioned official Proton', () => {
    const tools = [tool('proton_9', 'Proton 9.0 (Beta)')];
    expect(resolveSteamCompatibilityTool('auto', tools)).toBe('proton_9');
  });

  test('resolves to undefined when nothing usable is installed', () => {
    expect(resolveSteamCompatibilityTool('auto', [])).toBeUndefined();
  });

  test('returns an explicit setting unchanged even if not installed', () => {
    const tools = [tool('proton_experimental', 'Proton - Experimental')];
    expect(resolveSteamCompatibilityTool('GE-Proton10-4', tools)).toBe(
      'GE-Proton10-4'
    );
  });
});
