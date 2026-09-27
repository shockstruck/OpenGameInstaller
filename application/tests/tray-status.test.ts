import { describe, expect, test } from 'bun:test';
import {
  formatTrayTooltip,
  type TrayDownloadInfo,
} from '../src/frontend/lib/tray-status.js';

function download(overrides: Partial<TrayDownloadInfo>): TrayDownloadInfo {
  return {
    name: 'Some Game',
    status: 'downloading',
    progress: 0,
    downloadSpeed: 0,
    downloadSize: 0,
    ...overrides,
  };
}

describe('formatTrayTooltip', () => {
  test('idle text when there are no downloads', () => {
    expect(formatTrayTooltip([])).toBe('OpenGameInstaller');
  });

  test('idle text when only completed/errored/paused downloads exist', () => {
    const downloads = [
      download({ name: 'A', status: 'completed' }),
      download({ name: 'B', status: 'error' }),
      download({ name: 'C', status: 'paused' }),
    ];
    expect(formatTrayTooltip(downloads)).toBe('OpenGameInstaller');
  });

  test('one downloading item with every field present', () => {
    const downloads = [
      download({
        name: 'Hollow Knight',
        status: 'downloading',
        progress: 0.42,
        downloadSpeed: 12.3 * 1024 * 1024,
        downloadSize: 2.9 * 1024 * 1024 * 1024,
      }),
    ];
    const text = formatTrayTooltip(downloads);
    expect(text).toBe('Hollow Knight — 42% · 12.30 MB/s · 1.22 GB of 2.90 GB');
  });

  test('omits percentage and "of" size when progress is NaN', () => {
    const downloads = [
      download({
        name: 'Celeste',
        status: 'rd-downloading',
        progress: NaN,
        downloadSpeed: 1024 * 1024,
        downloadSize: 1024 * 1024 * 1024,
      }),
    ];
    expect(formatTrayTooltip(downloads)).toBe('Celeste — 1.00 MB/s');
  });

  test('omits size when downloadSize is unknown', () => {
    const downloads = [
      download({
        name: 'Outer Wilds',
        status: 'redistr-downloading',
        progress: 0.5,
        downloadSpeed: 500 * 1024,
        downloadSize: 0,
      }),
    ];
    expect(formatTrayTooltip(downloads)).toBe(
      'Outer Wilds — 50% · 500.00 KB/s'
    );
  });

  test('merging shows a phase label with no speed', () => {
    const downloads = [
      download({
        name: 'Disco Elysium',
        status: 'merging',
        progress: 0.9,
        downloadSpeed: 0,
        downloadSize: 1024,
      }),
    ];
    expect(formatTrayTooltip(downloads)).toBe('Disco Elysium — Merging');
  });

  test('installing-redistributables shows a phase label with no speed', () => {
    const downloads = [
      download({
        name: 'Redist Pack',
        status: 'installing-redistributables',
        progress: 0.1,
        downloadSpeed: 0,
        downloadSize: 0,
      }),
    ];
    expect(formatTrayTooltip(downloads)).toBe(
      'Redist Pack — Installing redistributables'
    );
  });

  test('collapses beyond three active downloads into a "+N more" line', () => {
    const downloads = [
      download({ name: 'A', progress: 0.1, downloadSpeed: 1024 }),
      download({ name: 'B', progress: 0.2, downloadSpeed: 1024 }),
      download({ name: 'C', progress: 0.3, downloadSpeed: 1024 }),
      download({ name: 'D', progress: 0.4, downloadSpeed: 1024 }),
      download({ name: 'E', progress: 0.5, downloadSpeed: 1024 }),
    ];
    const text = formatTrayTooltip(downloads);
    const lines = text.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('A — 10% · 1.00 KB/s');
    expect(lines[3]).toBe('+2 more');
  });
});
