import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

class MockBrowserWindow {}

type SpawnCall = { command: string; args: string[] };
const spawnCalls: SpawnCall[] = [];
const spawn = mock((command: string, args: string[]) => {
  spawnCalls.push({ command, args });
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  queueMicrotask(() => child.emit('close', 0, null));
  return child;
});

// Only override `spawn`; other suites in this process depend on the rest of
// node:child_process (execFile, exec, ...) staying real.
mock.module('child_process', () => ({ ...childProcess, spawn }));
mock.module('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: MockBrowserWindow,
}));
mock.module('@/electron/main.js', () => ({
  sendNotification: mock(() => {}),
  sendIPCMessage: mock(() => {}),
}));
mock.module('@/electron/startup.js', () => ({
  downloadLatestUmu: async () => ({ success: true, updated: false }),
  IS_NIXOS: false,
}));

const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ogi-umu-home-'));
const testOgiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogi-umu-data-'));
process.env.HOME = testHome;
process.env.OGI_DIRECTORY = testOgiDir;

let installRedistributablesWithUmu: typeof import('../src/electron/handlers/handler.umu.js').installRedistributablesWithUmu;

beforeAll(async () => {
  ({ installRedistributablesWithUmu } = await import(
    '../src/electron/handlers/handler.umu.js'
  ));
});

afterAll(() => {
  fs.rmSync(testHome, { recursive: true, force: true });
  fs.rmSync(testOgiDir, { recursive: true, force: true });
});

function writeLibrary(appID: number, data: unknown) {
  const dir = path.join(testOgiDir, 'library');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${appID}.json`), JSON.stringify(data));
}

describe('installRedistributablesWithUmu override parameter', () => {
  test('uses the recorded redistributables unchanged when the override is omitted', async () => {
    spawnCalls.length = 0;
    writeLibrary(101, {
      appID: 101,
      name: 'Recorded Game',
      cwd: testOgiDir,
      launchExecutable: path.join(testOgiDir, 'game.exe'),
      umu: { umuId: 'umu:101' },
      redistributables: [{ name: 'recorded-verb', path: 'winetricks' }],
    });

    const result = await installRedistributablesWithUmu(101);

    expect(result).toBe('success');
    expect(spawnCalls.map((call) => call.args)).toEqual([
      ['winetricks', '-q', '-f', 'recorded-verb'],
    ]);
  });

  test('replaces the recorded redistributables with the override for this run', async () => {
    spawnCalls.length = 0;
    writeLibrary(102, {
      appID: 102,
      name: 'Override Game',
      cwd: testOgiDir,
      launchExecutable: path.join(testOgiDir, 'game.exe'),
      umu: { umuId: 'umu:102' },
      redistributables: [{ name: 'recorded-verb', path: 'winetricks' }],
    });

    const result = await installRedistributablesWithUmu(102, undefined, [
      { name: 'override-verb', path: 'winetricks' },
    ]);

    expect(result).toBe('success');
    expect(spawnCalls.map((call) => call.args)).toEqual([
      ['winetricks', '-q', '-f', 'override-verb'],
    ]);
  });
});
