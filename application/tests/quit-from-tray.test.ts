import { describe, expect, test } from 'bun:test';
import {
  quitFromTray,
  type WindowLike,
} from '../src/electron/lib/quit-from-tray.js';

function fakeWindow(destroyed = false): WindowLike & { closed: boolean } {
  const win = {
    closed: false,
    isDestroyed: () => destroyed,
    close: () => {
      win.closed = true;
    },
  };
  return win;
}

describe('quitFromTray', () => {
  test('sets quitting before any window closes', () => {
    const order: string[] = [];
    const win = fakeWindow();
    quitFromTray({
      setQuitting: () => order.push('setQuitting'),
      getWindows: () => {
        order.push('getWindows');
        return [win];
      },
      quit: () => order.push('quit'),
    });

    expect(order[0]).toBe('setQuitting');
    expect(win.closed).toBe(true);
  });

  test('closes every open window', () => {
    const first = fakeWindow();
    const second = fakeWindow();
    quitFromTray({
      setQuitting: () => {},
      getWindows: () => [first, second],
      quit: () => {},
    });

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(true);
  });

  test('skips destroyed windows', () => {
    const destroyed = fakeWindow(true);
    quitFromTray({
      setQuitting: () => {},
      getWindows: () => [destroyed],
      quit: () => {},
    });

    expect(destroyed.closed).toBe(false);
  });

  test('does not call quit while windows exist', () => {
    let quitCalled = false;
    quitFromTray({
      setQuitting: () => {},
      getWindows: () => [fakeWindow()],
      quit: () => {
        quitCalled = true;
      },
    });

    expect(quitCalled).toBe(false);
  });

  test('calls quit when there are no open windows', () => {
    let quitCalled = false;
    quitFromTray({
      setQuitting: () => {},
      getWindows: () => [],
      quit: () => {
        quitCalled = true;
      },
    });

    expect(quitCalled).toBe(true);
  });

  test('calls quit when every window is destroyed', () => {
    let quitCalled = false;
    quitFromTray({
      setQuitting: () => {},
      getWindows: () => [fakeWindow(true), fakeWindow(true)],
      quit: () => {
        quitCalled = true;
      },
    });

    expect(quitCalled).toBe(true);
  });
});
