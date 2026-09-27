export type ThrottleClock = {
  now: () => number;
};

export type ThrottleTimer = {
  schedule: (fn: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
};

export const systemClock: ThrottleClock = {
  now: () => Date.now(),
};

export const systemTimer: ThrottleTimer = {
  schedule: (fn, delayMs) => setTimeout(fn, delayMs),
  cancel: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Wraps `apply` so it runs at most once per `intervalMs`: the first call
 * (or one arriving after a quiet period) lands immediately, a call arriving
 * sooner is deferred to the trailing edge of the window with whatever text
 * is current when the window closes, and text identical to what was last
 * applied is never re-applied.
 */
export function createTrailingThrottle(
  apply: (text: string) => void,
  intervalMs: number,
  clock: ThrottleClock = systemClock,
  timer: ThrottleTimer = systemTimer
): (text: string) => void {
  let lastAppliedText: string | undefined;
  let lastAppliedAt = Number.NEGATIVE_INFINITY;
  let pendingText: string | undefined;
  let pendingHandle: unknown;

  function flush(text: string) {
    apply(text);
    lastAppliedText = text;
    lastAppliedAt = clock.now();
  }

  return function setText(text: string): void {
    if (text === lastAppliedText && pendingHandle === undefined) return;

    if (pendingHandle !== undefined) {
      pendingText = text;
      return;
    }

    const elapsed = clock.now() - lastAppliedAt;
    if (elapsed >= intervalMs) {
      flush(text);
      return;
    }

    pendingText = text;
    pendingHandle = timer.schedule(() => {
      const finalText = pendingText as string;
      pendingText = undefined;
      pendingHandle = undefined;
      if (finalText !== lastAppliedText) {
        flush(finalText);
      }
    }, intervalMs - elapsed);
  };
}
