import { describe, expect, test } from 'bun:test';
import { decideLaunchDispatch } from '../src/frontend/lib/core/launch-dispatch.js';

describe('cold-start launch dispatch', () => {
  test('hookOnly always wins, regardless of wrapper/UMU', () => {
    expect(
      decideLaunchDispatch({ hookOnly: true, hasWrapper: true, hasUmu: true })
    ).toBe('hook');
    expect(
      decideLaunchDispatch({
        hookOnly: true,
        hasWrapper: false,
        hasUmu: false,
      })
    ).toBe('hook');
  });

  test('a wrapper command routes to the wrapper flow', () => {
    expect(
      decideLaunchDispatch({
        hookOnly: false,
        hasWrapper: true,
        hasUmu: true,
      })
    ).toBe('wrapper');
    expect(
      decideLaunchDispatch({
        hookOnly: false,
        hasWrapper: true,
        hasUmu: false,
      })
    ).toBe('wrapper');
  });

  test('UMU library data routes to the UMU flow when there is no wrapper', () => {
    expect(
      decideLaunchDispatch({
        hookOnly: false,
        hasWrapper: false,
        hasUmu: true,
      })
    ).toBe('umu');
  });

  test('no wrapper and no UMU data falls back to a direct launch', () => {
    expect(
      decideLaunchDispatch({
        hookOnly: false,
        hasWrapper: false,
        hasUmu: false,
      })
    ).toBe('direct');
  });
});
