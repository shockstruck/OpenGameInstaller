/**
 * A seeding torrent card can stop seeding only once its setup is over. Setup
 * logs exist from the moment setup starts and go inactive when it ends, so a
 * missing or active log means setup has not run or is still running; the
 * progress stream can show `seeding` on the card before then.
 */
export function canStopSeeding(
  download: { status: string; downloadType?: string },
  setupLog?: { isActive: boolean }
): boolean {
  return (
    download.status === 'seeding' &&
    (download.downloadType === 'torrent' ||
      download.downloadType === 'magnet') &&
    setupLog !== undefined &&
    !setupLog.isActive
  );
}
