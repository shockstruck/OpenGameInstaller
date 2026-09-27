import { describe, expect, test } from 'bun:test';
import {
  parseHiddenFlag,
  shouldHideOnClose,
} from '../src/electron/lib/close-behavior.js';

describe('shouldHideOnClose', () => {
  test('hides when a tray exists, the app is not quitting, and not gamescope', () => {
    expect(
      shouldHideOnClose({
        isQuitting: false,
        trayAvailable: true,
        gamescope: false,
      })
    ).toBe(true);
  });

  test('closes normally when quitting, even with a tray', () => {
    expect(
      shouldHideOnClose({
        isQuitting: true,
        trayAvailable: true,
        gamescope: false,
      })
    ).toBe(false);
  });

  test('closes normally in a gamescope session, even with a tray', () => {
    expect(
      shouldHideOnClose({
        isQuitting: false,
        trayAvailable: true,
        gamescope: true,
      })
    ).toBe(false);
  });

  test('closes normally when there is no tray', () => {
    expect(
      shouldHideOnClose({
        isQuitting: false,
        trayAvailable: false,
        gamescope: false,
      })
    ).toBe(false);
  });

  test('gamescope wins over a real quit request (still closes normally)', () => {
    expect(
      shouldHideOnClose({
        isQuitting: true,
        trayAvailable: true,
        gamescope: true,
      })
    ).toBe(false);
  });
});

describe('parseHiddenFlag', () => {
  test('detects --hidden anywhere in argv', () => {
    expect(parseHiddenFlag(['electron', '--hidden'])).toBe(true);
    expect(parseHiddenFlag(['electron', '--hidden', '--game-id=1'])).toBe(true);
  });

  test('is false without --hidden', () => {
    expect(parseHiddenFlag(['electron'])).toBe(false);
    expect(parseHiddenFlag(['electron', '--game-id=1'])).toBe(false);
  });
});
