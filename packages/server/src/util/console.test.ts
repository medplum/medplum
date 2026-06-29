// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockConsole } from './console';

describe('MockConsole', () => {
  let mockConsole: MockConsole;

  beforeEach(() => {
    mockConsole = new MockConsole();
  });

  test('all methods store messages in order', () => {
    mockConsole.log('log');
    mockConsole.error('error');
    mockConsole.warn('warn');
    mockConsole.info('info');
    mockConsole.debug('debug');
    mockConsole.trace('trace');

    expect(mockConsole.messages).toStrictEqual(['log', 'error', 'warn', 'info', 'debug', 'trace']);
  });

  test('multiple arguments are joined with a space', () => {
    mockConsole.debug('debug value', 42);
    expect(mockConsole.messages).toStrictEqual(['debug value 42']);
  });

  test('toString() returns all messages joined by newline', () => {
    mockConsole.log('first');
    mockConsole.error('second');
    mockConsole.warn('third');
    expect(mockConsole.toString()).toBe('first\nsecond\nthird');
  });
});
