// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, sleep } from '@medplum/core';
import { globalLogger } from './logger';

describe('Global Logger', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  test('Debug', () => {
    globalLogger.level = LogLevel.NONE;
    globalLogger.debug('test');
    expect(writeSpy).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.DEBUG;
    globalLogger.debug('test');
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"DEBUG","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}\n$/)
    );
  });

  test('Info', () => {
    globalLogger.level = LogLevel.NONE;
    globalLogger.info('test');
    expect(writeSpy).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.INFO;
    globalLogger.info('test');
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"INFO","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}\n$/)
    );
  });

  test('Warn', () => {
    globalLogger.level = LogLevel.NONE;
    globalLogger.warn('test');
    expect(writeSpy).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.WARN;
    globalLogger.warn('test');
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"WARN","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}\n$/)
    );
  });

  test('Error', () => {
    globalLogger.level = LogLevel.NONE;
    globalLogger.error('test');
    expect(writeSpy).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.ERROR;
    globalLogger.error('test');
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"ERROR","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}\n$/)
    );
  });

  test('Awaits drain when stdout buffer is backed up', async () => {
    const drainHandlers: (() => void)[] = [];
    writeSpy.mockImplementation((() => false) as any);
    const onceSpy = jest.spyOn(process.stdout, 'once').mockImplementation((event: any, handler: any) => {
      if (event === 'drain') {
        drainHandlers.push(handler);
      }
      return process.stdout;
    });

    globalLogger.level = LogLevel.ERROR;
    globalLogger.error('first');
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // Second write should be queued behind the pending drain promise.
    globalLogger.error('second');
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // Simulate drain — queued write fires.
    drainHandlers.forEach((h) => h());
    // Need to wait one tick for event handlers
    await sleep(0);
    expect(writeSpy).toHaveBeenCalledTimes(2);

    // Drain any pending state created by the second write.
    drainHandlers.forEach((h) => h());
    await sleep(0);

    onceSpy.mockRestore();
  });
});
