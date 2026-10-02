const TRAILING_SEPARATORS = /[/\\]+$/;

/** Visible folder WebTorrent stages new downloads in, inside the game folder. */
export const TORRENT_STAGING_DIR = 'torrent';
/** Hidden folder earlier versions staged into (`<job path>` + `.torrent`). */
export const LEGACY_TORRENT_STAGING_DIR = '.torrent';

const lastSegment = (path: string): string =>
  path.replace(TRAILING_SEPARATORS, '').split(/[/\\]/).pop() ?? '';

/**
 * Directory WebTorrent should write into for a job path. A legacy staging
 * directory that already exists is reused so in-flight and seeding downloads
 * resume where their data is; otherwise `<job path>/torrent` is used.
 */
export const torrentStagingPath = (
  jobPath: string,
  exists: (path: string) => boolean
): string => {
  const legacy = jobPath + LEGACY_TORRENT_STAGING_DIR;
  if (exists(legacy)) return legacy;
  return `${jobPath.replace(TRAILING_SEPARATORS, '')}/${TORRENT_STAGING_DIR}`;
};

/** Names inside the game folder that must never be moved into `old_files`. */
export const torrentStagingNames = (downloadPath: string): string[] => [
  TORRENT_STAGING_DIR,
  LEGACY_TORRENT_STAGING_DIR,
  lastSegment(downloadPath) + LEGACY_TORRENT_STAGING_DIR,
];

/** Entries of the game folder that setup should move into `old_files`. */
export const filesToStage = (
  currentFiles: string[],
  downloadPath: string,
  persistedNames: string[],
  isTorrent: boolean
): string[] => {
  const keep = [
    ...persistedNames,
    lastSegment(downloadPath),
    ...(isTorrent ? torrentStagingNames(downloadPath) : []),
    'old_files',
  ];
  return currentFiles.filter((file) => !keep.includes(file));
};
