import { DownloadError, formatError } from '@ogi-sdk/errors';
import { Effect } from 'effect';
import { updateDownloadStatus } from '@/frontend/lib/downloads/lifecycle';
import { electronRpc } from '@/frontend/lib/electron-rpc';

/** Stops uploading, keeps the files, and settles the card as set up. */
export function stopSeedingDownload(downloadId: string) {
  return electronRpc.torrent.stopSeeding(downloadId).pipe(
    Effect.mapError(
      (cause) =>
        new DownloadError({
          message: `Failed to stop seeding: ${formatError(cause)}`,
          downloadId,
          cause,
        })
    ),
    Effect.tap(() =>
      Effect.sync(() =>
        updateDownloadStatus(downloadId, {
          status: 'setup-complete',
          ratio: undefined,
        })
      )
    )
  );
}
