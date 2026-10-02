import type { FailedSetup } from '@/frontend/store.svelte';

/**
 * The saved failed setup behind an errored download card, if any. Only a
 * download whose setup failed after its files landed has one; a failed
 * transfer never writes a recovery record, so it gets no retry.
 */
export function findRetryableSetup(
  download: { id: string; status: string },
  setups: readonly FailedSetup[]
): FailedSetup | undefined {
  if (download.status !== 'error') return undefined;
  return setups.find(
    (setup) => (setup.downloadInfo?.id ?? setup.id) === download.id
  );
}

/** Re-runs setup for an errored download through the supplied retry. */
export function retryDownloadSetup<T>(
  download: { id: string; status: string },
  setups: readonly FailedSetup[],
  retry: (setup: FailedSetup) => T
): T | undefined {
  const setup = findRetryableSetup(download, setups);
  return setup ? retry(setup) : undefined;
}
