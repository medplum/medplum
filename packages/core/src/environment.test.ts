// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getBuffer, getWindow, isBrowserEnvironment, isNodeEnvironment, locationUtils } from './environment';

describe('Environment utils', () => {
  beforeAll(() => {
    // Suppress JSDOM warnings about location assignment
    console.error = jest.fn();
  });

  test('should run tests', () => {
    expect(() => isBrowserEnvironment()).not.toThrow();
    expect(() => isNodeEnvironment()).not.toThrow();
    expect(() => getWindow()).not.toThrow();
    expect(() => getBuffer()).not.toThrow();
    expect(() => locationUtils.assign('#foo')).not.toThrow();
    expect(() => locationUtils.reload()).not.toThrow();
    expect(() => locationUtils.getSearch()).not.toThrow();
    expect(() => locationUtils.getPathname()).not.toThrow();
    expect(() => locationUtils.getOrigin()).not.toThrow();
    expect(() => locationUtils.getLocation()).not.toThrow();
  });
});
