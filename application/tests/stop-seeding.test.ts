import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Fiber } from 'effect';
import { stopSeeding } from '../src/electron/lib/stop-seeding.js';
import { canStopSeeding } from '../src/frontend/lib/downloads/seedingEligibility.js';

describe('stop seeding', () => {
  test('qBittorrent removes the torrent and keeps its data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ogi-seed-'));
    const file = join(dir, 'game.bin');
    writeFileSync(file, 'payload');
    const removals: boolean[] = [];

    try {
      await Effect.runPromise(
        stopSeeding({
          clientType: 'qbittorrent',
          removeQbitTorrent: (deleteFiles) =>
            Effect.sync(() => {
              removals.push(deleteFiles);
            }),
        })
      );
      expect(removals).toEqual([false]);
      expect(readFileSync(file, 'utf8')).toBe('payload');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('WebTorrent interrupts the seeding fiber and never calls qBittorrent', async () => {
    let stopped = false;
    let removals = 0;
    const seeding = await Effect.runPromise(
      Effect.forkDaemon(
        Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              stopped = true;
            })
          )
        )
      )
    );
    await Effect.runPromise(Effect.yieldNow());

    await Effect.runPromise(
      stopSeeding({
        clientType: 'webtorrent',
        seedingFiber: seeding,
        removeQbitTorrent: () =>
          Effect.sync(() => {
            removals++;
          }),
      })
    );

    expect(stopped).toBe(true);
    expect(removals).toBe(0);
    expect(await Effect.runPromise(Fiber.poll(seeding))).not.toBeNull();
  });

  test('a card can stop seeding only when torrent setup is over', () => {
    const seeding = { status: 'seeding', downloadType: 'torrent' };
    expect(canStopSeeding(seeding)).toBe(true);
    expect(canStopSeeding(seeding, { isActive: false })).toBe(true);
    expect(canStopSeeding({ ...seeding, downloadType: 'magnet' })).toBe(true);
    expect(canStopSeeding(seeding, { isActive: true })).toBe(false);
    expect(canStopSeeding({ ...seeding, status: 'setup-complete' })).toBe(
      false
    );
    expect(canStopSeeding({ status: 'seeding', downloadType: 'direct' })).toBe(
      false
    );
  });
});
