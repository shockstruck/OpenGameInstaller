import { describe, expect, test } from 'bun:test';
import { withHiddenFiles } from '../src/electron/handlers/dialog-options.js';

describe('withHiddenFiles', () => {
  test('adds showHiddenFiles when properties is undefined', () => {
    expect(withHiddenFiles({}).properties).toEqual(['showHiddenFiles']);
  });

  test('keeps openFile and adds showHiddenFiles', () => {
    expect(withHiddenFiles({ properties: ['openFile'] }).properties).toEqual([
      'openFile',
      'showHiddenFiles',
    ]);
  });

  test('keeps openDirectory and adds showHiddenFiles', () => {
    expect(
      withHiddenFiles({ properties: ['openDirectory'] }).properties
    ).toEqual(['openDirectory', 'showHiddenFiles']);
  });

  test('does not duplicate an existing showHiddenFiles', () => {
    expect(
      withHiddenFiles({ properties: ['showHiddenFiles', 'openFile'] })
        .properties
    ).toEqual(['showHiddenFiles', 'openFile']);
  });

  test('leaves other option fields as they were', () => {
    const options = {
      title: 'Pick setup',
      defaultPath: '/tmp/game',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile' as const],
    };
    const result = withHiddenFiles(options);
    expect(result.title).toBe('Pick setup');
    expect(result.defaultPath).toBe('/tmp/game');
    expect(result.filters).toEqual([
      { name: 'Executables', extensions: ['exe'] },
    ]);
  });

  test('does not mutate its input', () => {
    const properties: Array<'openFile'> = ['openFile'];
    withHiddenFiles({ properties });
    expect(properties).toEqual(['openFile']);
  });
});
