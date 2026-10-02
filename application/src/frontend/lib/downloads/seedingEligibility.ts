/**
 * A seeding torrent card can stop seeding once its setup is over. While setup
 * logs are still active the card is mid-setup and must be left alone.
 */
export function canStopSeeding(
  download: { status: string; downloadType?: string },
  setupLog?: { isActive: boolean }
): boolean {
  return (
    download.status === 'seeding' &&
    (download.downloadType === 'torrent' ||
      download.downloadType === 'magnet') &&
    setupLog?.isActive !== true
  );
}
