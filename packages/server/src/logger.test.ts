import { LogLevel } from '@medplum/core';
import { globalLogger } from './logger';

describe('Global Logger', () => {
  test('Debug', () => {
    console.log = jest.fn();

    globalLogger.level = LogLevel.NONE;
    globalLogger.debug('test');
    expect(console.log).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.DEBUG;
    globalLogger.debug('test');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"DEBUG","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}$/)
    );
  });

  test('Info', () => {
    console.log = jest.fn();

    globalLogger.level = LogLevel.NONE;
    globalLogger.info('test');
    expect(console.log).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.INFO;
    globalLogger.info('test');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"INFO","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}$/)
    );
  });

  test('Warn', () => {
    console.log = jest.fn();

    globalLogger.level = LogLevel.NONE;
    globalLogger.warn('test');
    expect(console.log).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.WARN;
    globalLogger.warn('test');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"WARN","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}$/)
    );
  });

  test('Error', () => {
    console.log = jest.fn();

    globalLogger.level = LogLevel.NONE;
    globalLogger.error('test');
    expect(console.log).not.toHaveBeenCalled();

    globalLogger.level = LogLevel.ERROR;
    globalLogger.error('test');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"level":"ERROR","timestamp":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","msg":"test"\}$/)
    );
  });
});
