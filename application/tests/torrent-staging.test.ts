import { describe, expect, test } from 'bun:test';
import {
  filesToStage,
  torrentStagingNames,
  torrentStagingPath,
} from '../src/lib/torrent-staging.js';

const gamePath = '/home/k/UGI_Games/Split Fiction/';

describe('filesToStage', () => {
  // Reproduces the keep-list at 3b19e2e1 (DownloadManager.svelte): it only
  // knew `<Game>.torrent`, so the real `.torrent` folder was moved away.
  test('old keep-list moved the .torrent folder (regression baseline)', () => {
    const oldKeepList = ['Split Fiction', 'Split Fiction.torrent', 'old_files'];
    const moved = ['.torrent'].filter((f) => !oldKeepList.includes(f));
    expect(moved).toEqual(['.torrent']);
  });

  test('journal case: lone .torrent is not staged', () => {
    expect(filesToStage(['.torrent'], gamePath, [], true)).toEqual([]);
  });

  test('visible torrent folder is not staged', () => {
    expect(filesToStage(['torrent'], gamePath, [], true)).toEqual([]);
  });

  test('only unrelated files are staged next to torrent', () => {
    expect(filesToStage(['torrent', 'old.txt'], gamePath, [], true)).toEqual([
      'old.txt',
    ]);
  });

  test('legacy <Game>.torrent name is still kept', () => {
    expect(filesToStage(['Split Fiction.torrent'], gamePath, [], true)).toEqual(
      []
    );
  });

  test('non-torrent downloads do not keep torrent folders', () => {
    expect(filesToStage(['torrent'], gamePath, [], false)).toEqual(['torrent']);
  });

  test('persisted names, the game folder and old_files are kept', () => {
    expect(
      filesToStage(
        ['a.bin', 'Split Fiction', 'old_files', 'junk'],
        gamePath,
        ['a.bin'],
        true
      )
    ).toEqual(['junk']);
  });
});

describe('torrentStagingNames', () => {
  test('includes torrent, .torrent and <Game>.torrent', () => {
    expect(torrentStagingNames(gamePath)).toEqual([
      'torrent',
      '.torrent',
      'Split Fiction.torrent',
    ]);
  });
});

describe('torrentStagingPath', () => {
  test('new download uses a visible torrent dir', () => {
    expect(torrentStagingPath(gamePath, () => false)).toBe(
      '/home/k/UGI_Games/Split Fiction/torrent'
    );
  });

  test('existing legacy .torrent dir is reused', () => {
    const seen: string[] = [];
    const result = torrentStagingPath(gamePath, (p) => {
      seen.push(p);
      return true;
    });
    expect(result).toBe('/home/k/UGI_Games/Split Fiction/.torrent');
    expect(seen).toEqual(['/home/k/UGI_Games/Split Fiction/.torrent']);
  });

  test('job path without trailing slash', () => {
    expect(
      torrentStagingPath('/home/k/UGI_Games/Split Fiction', () => false)
    ).toBe('/home/k/UGI_Games/Split Fiction/torrent');
  });

  test('legacy dir for a job path without trailing slash is <job>.torrent', () => {
    expect(
      torrentStagingPath(
        '/home/k/UGI_Games/Split Fiction',
        (p) => p === '/home/k/UGI_Games/Split Fiction.torrent'
      )
    ).toBe('/home/k/UGI_Games/Split Fiction.torrent');
  });
});
