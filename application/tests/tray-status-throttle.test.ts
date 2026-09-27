import { describe, expect, test } from 'bun:test';
import { createTrailingThrottle } from '../src/electron/lib/tray-status-throttle.js';

function fakeScheduler() {
  let currentTime = 0;
  const pending: { fn: () => void; at: number }[] = [];
  return {
    clock: { now: () => currentTime },
    timer: {
      schedule: (fn: () => void, delayMs: number) => {
        const handle = { fn, at: currentTime + delayMs };
        pending.push(handle);
        return handle;
      },
      cancel: (handle: unknown) => {
        const index = pending.indexOf(handle as (typeof pending)[number]);
        if (index !== -1) pending.splice(index, 1);
      },
    },
    advance(ms: number) {
      currentTime += ms;
      const due = pending.filter((p) => p.at <= currentTime);
      for (const handle of due) {
        pending.splice(pending.indexOf(handle), 1);
        handle.fn();
      }
    },
  };
}

describe('createTrailingThrottle', () => {
  test('the first call applies immediately', () => {
    const applied: string[] = [];
    const { clock, timer } = fakeScheduler();
    const setText = createTrailingThrottle(
      (text) => applied.push(text),
      2000,
      clock,
      timer
    );

    setText('a');

    expect(applied).toEqual(['a']);
  });

  test('a second call within 2s is deferred and applied on the trailing edge with the latest text', () => {
    const applied: string[] = [];
    const scheduler = fakeScheduler();
    const setText = createTrailingThrottle(
      (text) => applied.push(text),
      2000,
      scheduler.clock,
      scheduler.timer
    );

    setText('a');
    scheduler.advance(500);
    setText('b');
    scheduler.advance(800);
    setText('c');

    expect(applied).toEqual(['a']);

    scheduler.advance(700);

    expect(applied).toEqual(['a', 'c']);
  });

  test('identical text is never re-applied', () => {
    const applied: string[] = [];
    const scheduler = fakeScheduler();
    const setText = createTrailingThrottle(
      (text) => applied.push(text),
      2000,
      scheduler.clock,
      scheduler.timer
    );

    setText('a');
    scheduler.advance(2500);
    setText('a');

    expect(applied).toEqual(['a']);
  });

  test('identical text within the throttle window never schedules a trailing call', () => {
    const applied: string[] = [];
    const scheduler = fakeScheduler();
    const setText = createTrailingThrottle(
      (text) => applied.push(text),
      2000,
      scheduler.clock,
      scheduler.timer
    );

    setText('a');
    scheduler.advance(500);
    setText('a');
    scheduler.advance(2000);

    expect(applied).toEqual(['a']);
  });
});
