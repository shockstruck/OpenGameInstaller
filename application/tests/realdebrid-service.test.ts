import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Effect } from 'effect';
import { writable } from 'svelte/store';

// store.svelte.ts uses Svelte 5 runes ($state), which bun's plain TS
// transpiler can't compile outside the Svelte toolchain; swap it for a
// plain svelte/store writable so importing the download services works.
mock.module('@/frontend/store.svelte', () => ({
  currentDownloads: writable([]),
  createNotification: () => {},
}));

const unrestrictLinkCalls: string[] = [];

mock.module('@/frontend/lib/electron-rpc', () => ({
  electronRpc: {
    realdebrid: {
      updateKey: () => Effect.succeed(true),
      getHosts: () => Effect.succeed([{ host: 'real-debrid.com' }]),
      addMagnet: () => Effect.succeed({ id: 'torrent-1' }),
      addTorrent: () => Effect.succeed({ id: 'torrent-1' }),
      isTorrentReady: () => Effect.succeed(true),
      selectTorrent: () => Effect.succeed(true),
      getTorrentInfo: () => Effect.succeed({ links: currentLinks }),
      unrestrictLink: (link: string) => {
        unrestrictLinkCalls.push(link);
        return Effect.succeed({ download: `https://resolved/${link}` });
      },
    },
    ddl: {
      download: () =>
        Effect.succeed({
          status: 'success',
          id: 'handshake-1',
          queuePosition: 0,
        }),
    },
    download: {
      consumeReplayEvents: () => Effect.succeed([]),
    },
  },
}));

mock.module('@/frontend/lib/core/fs', () => ({
  getDownloadPath: () => '/downloads',
}));

const updateDownloadStatusCalls: unknown[] = [];
mock.module('@/frontend/utils', () => ({
  updateDownloadStatus: (id: string, patch: unknown) => {
    updateDownloadStatusCalls.push(patch);
  },
}));

// The fake `getTorrentInfo` above reads this module-scoped variable so each
// test can control the link set without re-registering `mock.module`.
let currentLinks: string[] = [];

let RealDebridService: typeof import('../src/frontend/lib/downloads/services/RealDebridService.js').RealDebridService;

beforeEach(async () => {
  unrestrictLinkCalls.length = 0;
  updateDownloadStatusCalls.length = 0;
  currentLinks = [];
  if (!RealDebridService) {
    ({ RealDebridService } = await import(
      '../src/frontend/lib/downloads/services/RealDebridService.js'
    ));
  }
});

const baseResult = {
  addonSource: 'test-addon',
  addonName: 'Test Addon',
  capsuleImage: '',
  coverImage: '',
  storefront: 'test',
  downloadType: 'torrent' as const,
  name: 'Some Game',
  filename: 'some-game.rar',
  downloadURL: 'magnet:?xt=urn:btih:test',
};

describe('RealDebridService multi-link downloads', () => {
  test('unrestricts every link, in order, for a three-link release', async () => {
    currentLinks = ['rd-link-a', 'rd-link-b', 'rd-link-c'];
    const service = new RealDebridService();

    await Effect.runPromise(service.startDownload(baseResult, 1, null));

    expect(unrestrictLinkCalls).toEqual([
      'rd-link-a',
      'rd-link-b',
      'rd-link-c',
    ]);
  });

  test('unrestricts the single link of a one-file release', async () => {
    currentLinks = ['rd-link-only'];
    const service = new RealDebridService();

    await Effect.runPromise(service.startDownload(baseResult, 1, null));

    expect(unrestrictLinkCalls).toEqual(['rd-link-only']);
  });

  test('makes no unrestrict calls when the torrent has no links', async () => {
    currentLinks = [];
    const service = new RealDebridService();

    await Effect.runPromise(service.startDownload(baseResult, 1, null));

    expect(unrestrictLinkCalls).toEqual([]);
  });

  test('passes one file per resolved link to the download caller', async () => {
    currentLinks = ['rd-link-a', 'rd-link-b'];
    const service = new RealDebridService();

    await Effect.runPromise(service.startDownload(baseResult, 1, null));

    expect(updateDownloadStatusCalls).toHaveLength(1);
    const patch = updateDownloadStatusCalls[0] as {
      files: { downloadURL: string }[];
    };
    expect(patch.files).toHaveLength(2);
    expect(patch.files.map((f) => f.downloadURL)).toEqual([
      'https://resolved/rd-link-a',
      'https://resolved/rd-link-b',
    ]);
  });
});
