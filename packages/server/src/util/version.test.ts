import { isValidMedplumSemver } from '@medplum/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getServerVersion } from './version';

jest.mock('node:fs', () => {
  return {
    readFileSync: jest.fn(() => '{ "version": "4.0.0" }'),
  };
});

describe('getServerVersion', () => {
  test('getServerVersion', () => {
    // Initial access
    expect(getServerVersion()).toEqual('4.0.0');
    expect(readFileSync).toHaveBeenCalledWith(resolve(__dirname, '../../package.json'), {
      encoding: 'utf-8',
    });

    // Clear the mock, make sure file isn't read again
    jest.mocked(readFileSync).mockClear();
    expect(getServerVersion()).toEqual('4.0.0');
    expect(readFileSync).not.toHaveBeenCalled();
  });

  test('File path', () => {
    // Since we mock `readFileSync` here,
    // We should test that this filepath asserted is actually a valid package.json with a version
    // In case this file ever moves in the future
    const file = readFileSync(resolve(__dirname, '../../package.json'), {
      encoding: 'utf-8',
    });
    expect(isValidMedplumSemver(JSON.parse(file).version)).toStrictEqual(true);
  });
});
