// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockConsole } from './console';

describe('MockConsole', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('captures common console methods', () => {
    const mockConsole = new MockConsole();

    mockConsole.log('log', 1);
    mockConsole.info('info', 2);
    mockConsole.warn('warn', 3);
    mockConsole.error('error', 4);
    mockConsole.debug('debug', 5);
    mockConsole.trace('trace', 6);
    mockConsole.dir('dir', 7);
    mockConsole.table('table', 8);
    mockConsole.dirxml('dirxml', 9);
    mockConsole.group('group', 10);
    mockConsole.groupCollapsed('groupCollapsed', 11);
    mockConsole.groupEnd();

    expect(mockConsole.toString()).toBe(
      [
        'log 1',
        'info 2',
        'warn 3',
        'error 4',
        'debug 5',
        'trace 6',
        'dir 7',
        'table 8',
        'dirxml 9',
        'group 10',
        'groupCollapsed 11',
      ].join('\n')
    );
  });

  test('supports assert and clear', () => {
    const mockConsole = new MockConsole();

    mockConsole.assert(true, 'ignored');
    mockConsole.assert(false, 'recorded');
    mockConsole.clear();

    expect(mockConsole.toString()).toBe('Assertion failed: recorded');
  });

  test('supports count and time methods', () => {
    const mockConsole = new MockConsole();
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(125).mockReturnValueOnce(150);

    mockConsole.count('jobs');
    mockConsole.count('jobs');
    mockConsole.countReset('jobs');
    mockConsole.count('jobs');
    mockConsole.time('deploy');
    mockConsole.timeLog('deploy', 'halfway');
    mockConsole.timeEnd('deploy');

    expect(mockConsole.toString()).toBe(
      ['jobs: 1', 'jobs: 2', 'jobs: 1', 'deploy: 25ms halfway', 'deploy: 50ms'].join('\n')
    );
  });
});
