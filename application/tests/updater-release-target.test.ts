import { beforeAll, describe, expect, mock, test } from 'bun:test';

mock.module('electron', () => ({
  app: { isPackaged: true, getAppPath: () => '/tmp' },
  net: { online: true },
}));
mock.module('original-fs', () => ({
  chmodSync: () => {},
  closeSync: () => {},
  copyFileSync: () => {},
  createReadStream: () => {},
  createWriteStream: () => {},
  existsSync: () => false,
  mkdirSync: () => {},
  openSync: () => {},
  readdirSync: () => [],
  readFileSync: () => '',
  readSync: () => {},
  rmSync: () => {},
  statSync: () => ({}),
  writeFileSync: () => {},
  writeSync: () => {},
}));

let buildReleaseListUrl: typeof import('../src/electron/updater.js').buildReleaseListUrl;
let isVersionNewer: typeof import('../src/electron/updater.js').isVersionNewer;

beforeAll(async () => {
  ({ buildReleaseListUrl, isVersionNewer } = await import(
    '../src/electron/updater.js'
  ));
});

describe('release list URL', () => {
  test('targets the shockstruck fork', () => {
    expect(buildReleaseListUrl('shockstruck/OpenGameInstaller')).toBe(
      'https://api.github.com/repos/shockstruck/OpenGameInstaller/releases'
    );
  });
});

describe('fork prerelease version comparison', () => {
  test('a fork build outranks the bare upstream version it is built on', () => {
    expect(isVersionNewer('4.3.1-ss.1', '4.3.1')).toBe(true);
    expect(isVersionNewer('4.3.1', '4.3.1-ss.1')).toBe(false);
  });

  test('a later fork build outranks an earlier one', () => {
    expect(isVersionNewer('4.3.1-ss.2', '4.3.1-ss.1')).toBe(true);
    expect(isVersionNewer('4.3.1-ss.1', '4.3.1-ss.2')).toBe(false);
  });

  test('still compares plain releases by semver', () => {
    expect(isVersionNewer('4.3.1', '4.2.0')).toBe(true);
    expect(isVersionNewer('4.2.0', '4.3.1')).toBe(false);
  });
});
