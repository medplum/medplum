// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { addDefaults, isBooleanConfig, isIntegerConfig, isObjectConfig } from './utils';

describe('utils', () => {
  test('isObjectConfig', () => {
    expect(isObjectConfig('smtp')).toBe(true);
  });

  test('isBooleanConfig', () => {
    expect(isBooleanConfig('baseUrl')).toBe(false);
    expect(isBooleanConfig('logRequests')).toBe(true);
  });

  test('isIntegerConfig', () => {
    expect(isIntegerConfig('baseUrl')).toBe(false);
    expect(isIntegerConfig('port')).toBe(true);
  });

  test('addDefaults sets maxSearchOffset default', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
    } as any);
    expect(config.maxSearchOffset).toBe(10_000);
  });

  test('addDefaults preserves existing maxSearchOffset', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
      maxSearchOffset: 5000,
    } as any);
    expect(config.maxSearchOffset).toBe(5000);
  });
});
