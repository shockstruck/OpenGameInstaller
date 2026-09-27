import { describe, expect, test } from 'bun:test';
import {
  hasUmuRunOverride,
  OGI_UMU_RUN_ENV,
  resolveUmuRunExecutable,
} from './umu-path';

const bundledPath = '/opt/ogi/bin/umu/umu-run';
const overridePath = '/nix/store/abc-umu-launcher/bin/umu-run';

describe('resolveUmuRunExecutable', () => {
  test('returns the bundled path when the override is unset', () => {
    expect(resolveUmuRunExecutable(bundledPath, {})).toBe(bundledPath);
  });

  test('returns the override when it is absolute and executable', () => {
    const env = { [OGI_UMU_RUN_ENV]: overridePath };
    expect(resolveUmuRunExecutable(bundledPath, env, () => true)).toBe(
      overridePath
    );
  });

  test('falls back to the bundled path when the override is a relative path', () => {
    const env = { [OGI_UMU_RUN_ENV]: 'bin/umu-run' };
    expect(resolveUmuRunExecutable(bundledPath, env, () => true)).toBe(
      bundledPath
    );
  });

  test('falls back to the bundled path when the override is missing or not executable', () => {
    const env = { [OGI_UMU_RUN_ENV]: overridePath };
    expect(resolveUmuRunExecutable(bundledPath, env, () => false)).toBe(
      bundledPath
    );
  });
});

describe('hasUmuRunOverride', () => {
  test('is false when unset', () => {
    expect(hasUmuRunOverride({})).toBe(false);
  });

  test('is true only for an absolute, executable override', () => {
    const env = { [OGI_UMU_RUN_ENV]: overridePath };
    expect(hasUmuRunOverride(env, () => true)).toBe(true);
    expect(hasUmuRunOverride(env, () => false)).toBe(false);
    expect(
      hasUmuRunOverride({ [OGI_UMU_RUN_ENV]: 'bin/umu-run' }, () => true)
    ).toBe(false);
  });
});
