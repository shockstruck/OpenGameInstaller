import { beforeAll, describe, expect, mock, test } from 'bun:test';

mock.module('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => '/tmp',
    getPath: () => '/tmp',
    on: () => {},
    exit: () => {},
  },
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { handle: () => {} },
  net: { online: true },
}));

let buildReleaseListUrl: typeof import('../src/main.js').buildReleaseListUrl;
let compareReleaseOrder: typeof import('../src/main.js').compareReleaseOrder;

beforeAll(async () => {
  ({ buildReleaseListUrl, compareReleaseOrder } = await import(
    '../src/main.js'
  ));
});

describe('release list URL', () => {
  test('targets the shockstruck fork', () => {
    expect(buildReleaseListUrl('shockstruck/OpenGameInstaller')).toBe(
      'https://api.github.com/repos/shockstruck/OpenGameInstaller/releases'
    );
  });
});

describe('fork prerelease version ordering', () => {
  test('a fork build outranks the bare upstream tag it is built on', () => {
    expect(
      compareReleaseOrder({ tag_name: '4.3.1-ss.1' }, { tag_name: '4.3.1' })
    ).toBeLessThan(0);
  });

  test('a later fork build outranks an earlier one', () => {
    expect(
      compareReleaseOrder(
        { tag_name: '4.3.1-ss.2' },
        { tag_name: '4.3.1-ss.1' }
      )
    ).toBeLessThan(0);
  });

  test('still orders plain releases by semver', () => {
    expect(
      compareReleaseOrder({ tag_name: '4.3.1' }, { tag_name: '4.2.0' })
    ).toBeLessThan(0);
  });
});
