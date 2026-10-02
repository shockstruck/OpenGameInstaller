import type { TorrentError } from '@ogi-sdk/errors';
import { Effect, Fiber } from 'effect';

export type SeedingHandle = {
  clientType: 'webtorrent' | 'qbittorrent' | 'unselected';
  seedingFiber?: Fiber.RuntimeFiber<void, unknown>;
  removeQbitTorrent: (
    deleteFiles: boolean
  ) => Effect.Effect<void, TorrentError>;
};

/**
 * Stops uploading a finished torrent without touching the downloaded files:
 * qBittorrent drops the torrent but keeps its data, WebTorrent interrupts the
 * seeding fiber, whose finalizer destroys the torrent without its store.
 */
export function stopSeeding(
  handle: SeedingHandle
): Effect.Effect<void, TorrentError> {
  if (handle.clientType === 'qbittorrent') {
    return handle.removeQbitTorrent(false);
  }
  return handle.seedingFiber
    ? Fiber.interrupt(handle.seedingFiber).pipe(Effect.asVoid)
    : Effect.void;
}
