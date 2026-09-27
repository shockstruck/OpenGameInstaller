import type { DownloadStatusAndInfo } from '@/frontend/store.svelte';

/** The subset of a download's fields the tray tooltip needs. */
export type TrayDownloadInfo = Pick<
  DownloadStatusAndInfo,
  'name' | 'status' | 'progress' | 'downloadSpeed' | 'downloadSize'
>;

const IDLE_TOOLTIP = 'OpenGameInstaller';
const MAX_LINES = 3;

const DOWNLOADING_STATUSES = new Set<DownloadStatusAndInfo['status']>([
  'downloading',
  'rd-downloading',
  'redistr-downloading',
]);

const PROCESSING_LABELS: Partial<
  Record<DownloadStatusAndInfo['status'], string>
> = {
  merging: 'Merging',
  'installing-redistributables': 'Installing redistributables',
};

/** 1024-based byte formatter, matching StorePage.svelte's formatSize. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 1024-based speed formatter, matching StorePage.svelte's formatSpeed. */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatActiveLine(download: TrayDownloadInfo): string {
  const processingLabel = PROCESSING_LABELS[download.status];
  if (processingLabel) {
    return `${download.name} — ${processingLabel}`;
  }

  const segments: string[] = [];
  const hasProgress = Number.isFinite(download.progress);
  if (hasProgress) {
    segments.push(`${Math.round(download.progress * 100)}%`);
  }
  segments.push(formatSpeed(download.downloadSpeed));

  const hasSize =
    Number.isFinite(download.downloadSize) && download.downloadSize > 0;
  if (hasProgress && hasSize) {
    segments.push(
      `${formatBytes(download.progress * download.downloadSize)} of ${formatBytes(download.downloadSize)}`
    );
  }

  return `${download.name} — ${segments.join(' · ')}`;
}

/**
 * Builds the tray icon's tooltip text from the current downloads. Idle text
 * when nothing is active; otherwise up to three lines, one per active
 * download, with any remainder collapsed into a "+N more" line.
 */
export function formatTrayTooltip(
  downloads: readonly TrayDownloadInfo[]
): string {
  const active = downloads.filter(
    (download) =>
      DOWNLOADING_STATUSES.has(download.status) ||
      download.status in PROCESSING_LABELS
  );

  if (active.length === 0) return IDLE_TOOLTIP;

  const lines = active.slice(0, MAX_LINES).map(formatActiveLine);
  if (active.length > MAX_LINES) {
    lines.push(`+${active.length - MAX_LINES} more`);
  }

  return lines.join('\n');
}
