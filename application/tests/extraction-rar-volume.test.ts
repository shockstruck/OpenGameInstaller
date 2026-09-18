import { describe, expect, mock, test } from 'bun:test';
import { writable } from 'svelte/store';

// extraction.ts imports the frontend electron-rpc client, whose module-level
// `window.addEventListener` throws outside a browser; selectRarVolume itself
// never touches it, so a minimal stub is enough to import the module here.
mock.module('@/frontend/lib/electron-rpc', () => ({ electronRpc: {} }));

// core/fs.ts pulls in store.svelte.ts, which uses Svelte 5 runes ($state)
// that bun's plain TS transpiler can't compile outside the Svelte toolchain.
mock.module('@/frontend/store.svelte', () => ({
  createNotification: () => {},
  currentDownloads: writable([]),
}));

const { selectRarVolume } = await import('../src/frontend/lib/setup/extraction.js');

describe('selectRarVolume', () => {
  test('picks the lowest .partN.rar volume regardless of listing order', () => {
    expect(
      selectRarVolume(['x.part2.rar', 'x.part1.rar', 'x.part10.rar'])
    ).toBe('x.part1.rar');
  });

  test('picks the .rar header file when old-style .rNN volumes are present', () => {
    expect(selectRarVolume(['a.r00', 'a.r01', 'a.rar'])).toBe('a.rar');
  });

  test('picks the only .rar candidate', () => {
    expect(selectRarVolume(['only.rar'])).toBe('only.rar');
  });

  test('picks the lexicographically first of several unrelated .rar files', () => {
    expect(selectRarVolume(['b.rar', 'a.rar'])).toBe('a.rar');
  });

  test('returns null when nothing matches', () => {
    expect(selectRarVolume([])).toBe(null);
  });
});
