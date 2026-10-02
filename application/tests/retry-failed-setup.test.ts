import { describe, expect, test } from 'bun:test';
import {
  findRetryableSetup,
  retryDownloadSetup,
} from '../src/frontend/lib/recovery/retryEligibility.js';

const failedSetup = (downloadId: string) =>
  ({
    id: downloadId,
    timestamp: 1,
    retryCount: 0,
    downloadInfo: { id: downloadId },
    setupData: {},
    error: 'setup failed',
    should: 'call-addon',
  }) as never;

describe('retry for failed setups', () => {
  const setups = [failedSetup('a')];

  test('exposes retry for an errored download with a failed setup', () => {
    expect(findRetryableSetup({ id: 'a', status: 'error' }, setups)).toBe(
      setups[0]
    );
  });

  test('hides retry for a failed transfer with no setup record', () => {
    expect(findRetryableSetup({ id: 'b', status: 'error' }, setups)).toBe(
      undefined
    );
  });

  test('hides retry unless the download is in the error state', () => {
    for (const status of ['downloading', 'setup-complete', 'seeding']) {
      expect(findRetryableSetup({ id: 'a', status }, setups)).toBeUndefined();
    }
  });

  test('dispatches the existing retry with the saved setup only', () => {
    const calls: unknown[] = [];
    retryDownloadSetup({ id: 'a', status: 'error' }, setups, (s) =>
      calls.push(s)
    );
    retryDownloadSetup({ id: 'b', status: 'error' }, setups, (s) =>
      calls.push(s)
    );
    expect(calls).toEqual([setups[0]]);
  });
});
