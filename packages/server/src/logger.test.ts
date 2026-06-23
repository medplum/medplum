// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel } from '@medplum/core';
import { drainStdout, exitAfterStdoutDrain, globalLogger } from './logger';

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

  test('Writes are not queued when stdout buffer is backed up', () => {
    writeSpy.mockImplementation((() => false) as any);

    globalLogger.level = LogLevel.ERROR;
    globalLogger.error('first');
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // Writes are no longer queued behind drain — drain is awaited explicitly at process exit.
    globalLogger.error('second');
    expect(writeSpy).toHaveBeenCalledTimes(2);
  });

  test('drainStdout is a no-op when stdout does not need draining', async () => {
    Object.defineProperty(process.stdout, 'writableNeedDrain', { value: false, configurable: true });
    const onceSpy = jest.spyOn(process.stdout, 'once');
    await drainStdout();
    expect(onceSpy).not.toHaveBeenCalled();
    onceSpy.mockRestore();
  });

  test('drainStdout awaits the drain event when stdout needs draining', async () => {
    Object.defineProperty(process.stdout, 'writableNeedDrain', { value: true, configurable: true });
    const onceSpy = jest.spyOn(process.stdout, 'once').mockImplementation((event: any, handler: any) => {
      if (event === 'drain') {
        setImmediate(handler);
      }
      return process.stdout;
    });

    await drainStdout();
    expect(onceSpy).toHaveBeenCalledWith('drain', expect.any(Function));

    onceSpy.mockRestore();
    Object.defineProperty(process.stdout, 'writableNeedDrain', { value: false, configurable: true });
  });

  test('exitAfterStdoutDrain drains then exits with given code (default 1)', async () => {
    Object.defineProperty(process.stdout, 'writableNeedDrain', { value: false, configurable: true });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await exitAfterStdoutDrain();
    expect(exitSpy).toHaveBeenLastCalledWith(1);

    await exitAfterStdoutDrain(2);
    expect(exitSpy).toHaveBeenLastCalledWith(2);

    exitSpy.mockRestore();
  });
});
