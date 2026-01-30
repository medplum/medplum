// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockConsole } from './console';

describe('MockConsole', () => {
  let mockConsole: MockConsole;

  beforeEach(() => {
    mockConsole = new MockConsole();
  });

  test('log', () => {
    mockConsole.log('hello', 'world');
    expect(mockConsole.messages).toEqual(['hello world']);
  });

  test('error', () => {
    mockConsole.error('something went wrong');
    expect(mockConsole.messages).toEqual(['something went wrong']);
  });

  test('warn', () => {
    mockConsole.warn('be careful');
    expect(mockConsole.messages).toEqual(['be careful']);
  });

  test('info', () => {
    mockConsole.info('for your information');
    expect(mockConsole.messages).toEqual(['for your information']);
  });

  test('debug', () => {
    mockConsole.debug('debug details');
    expect(mockConsole.messages).toEqual(['debug details']);
  });

  test('trace', () => {
    mockConsole.trace('trace info');
    expect(mockConsole.messages).toEqual(['trace info']);
  });

  test('dir', () => {
    mockConsole.dir({ key: 'value' });
    expect(mockConsole.messages).toHaveLength(1);
    expect(JSON.parse(mockConsole.messages[0])).toEqual({ key: 'value' });
  });

  test('dir with string', () => {
    mockConsole.dir('plain string');
    expect(mockConsole.messages).toEqual(['plain string']);
  });

  test('dir with undefined', () => {
    mockConsole.dir(undefined);
    expect(mockConsole.messages).toHaveLength(0);
  });

  test('assert with truthy condition', () => {
    mockConsole.assert(true, 'should not appear');
    expect(mockConsole.messages).toHaveLength(0);
  });

  test('assert with falsy condition', () => {
    mockConsole.assert(false, 'expected true');
    expect(mockConsole.messages).toEqual(['Assertion failed: expected true']);
  });

  test('time and timeEnd do not throw', () => {
    expect(() => {
      mockConsole.time('timer');
      mockConsole.timeEnd('timer');
    }).not.toThrow();
  });

  test('timeLog does not throw', () => {
    expect(() => {
      mockConsole.timeLog('timer', 'data');
    }).not.toThrow();
  });

  test('group', () => {
    mockConsole.group('group label');
    expect(mockConsole.messages).toEqual(['group label']);
  });

  test('groupEnd does not throw', () => {
    expect(() => mockConsole.groupEnd()).not.toThrow();
  });

  test('table with object', () => {
    mockConsole.table([1, 2, 3]);
    expect(mockConsole.messages).toHaveLength(1);
    expect(JSON.parse(mockConsole.messages[0])).toEqual([1, 2, 3]);
  });

  test('table with undefined', () => {
    mockConsole.table(undefined);
    expect(mockConsole.messages).toHaveLength(0);
  });

  test('clear does not remove messages', () => {
    mockConsole.log('preserved');
    mockConsole.clear();
    expect(mockConsole.messages).toEqual(['preserved']);
  });

  test('count and countReset do not throw', () => {
    expect(() => {
      mockConsole.count('label');
      mockConsole.countReset('label');
    }).not.toThrow();
  });

  test('toString', () => {
    mockConsole.log('line 1');
    mockConsole.error('line 2');
    mockConsole.warn('line 3');
    expect(mockConsole.toString()).toBe('line 1\nline 2\nline 3');
  });

  test('multiple params joined with space', () => {
    mockConsole.error('Error:', 404, 'Not Found');
    expect(mockConsole.messages).toEqual(['Error: 404 Not Found']);
  });
});
