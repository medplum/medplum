import { randomUUID } from 'crypto';
import { LogLevel, Logger, parseLogLevel } from './logger';

describe('Logger', () => {
  let testLogger: Logger;
  let testOutput: jest.Mock<void, [Record<string, any>]>;

  beforeEach(() => {
    testOutput = jest.fn();
    testLogger = new Logger((msg) => testOutput(JSON.parse(msg)), undefined, LogLevel.DEBUG);
  });

  test('Info', () => {
    testLogger.info('Boing!');
    expect(testOutput).toHaveBeenCalledWith(expect.objectContaining({ level: 'INFO', msg: 'Boing!' }));
  });

  test('Warn', () => {
    testLogger.warn('Warning');
    expect(testOutput).toHaveBeenCalledWith(expect.objectContaining({ level: 'WARN', msg: 'Warning' }));
  });

  test('Error', () => {
    testLogger.error('Fatal error', new Error('Catastrophe!'));
    expect(testOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        msg: 'Fatal error',
        error: 'Error: Catastrophe!',
        stack: expect.arrayContaining(['Error: Catastrophe!']),
      })
    );
  });

  test('Does not write when logger is disabled', () => {
    const unlogger = new Logger((msg) => testOutput(JSON.parse(msg)), undefined, LogLevel.NONE);
    unlogger.error('Annihilation imminent');
    expect(testOutput).not.toHaveBeenCalled();
  });

  test('Does not log when level is above configured maximum', () => {
    const logger = new Logger((msg) => testOutput(JSON.parse(msg)), undefined, LogLevel.INFO);
    logger.debug('Evil bit unset');
    expect(testOutput).not.toHaveBeenCalled();
  });

  test('Logger metadata attached to logs', () => {
    const logger = new Logger((msg) => testOutput(JSON.parse(msg)), { foo: 'bar' }, LogLevel.INFO);
    logger.info('Patient merged', { id: randomUUID() });
    expect(testOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        msg: 'Patient merged',
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
        foo: 'bar',
      })
    );
  });

  test('With prefix', () => {
    const logger = new Logger((msg) => testOutput(JSON.parse(msg)), undefined, LogLevel.INFO, { prefix: '[TEST] ' });
    logger.info('Testing prefix');
    expect(testOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        msg: '[TEST] Testing prefix',
      })
    );
  });

  test('Clone logger', () => {
    const logger = new Logger((msg) => testOutput(JSON.parse(msg)), undefined, LogLevel.INFO);
    const clonedLogger1 = logger.clone();
    const clonedLogger2 = logger.clone({ options: { prefix: '[CLONED] ' } });
    logger.info('Testing clone');
    clonedLogger1.info('Testing clone');
    clonedLogger2.info('Testing clone');
    expect(testOutput).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'INFO',
        msg: 'Testing clone',
      })
    );
    expect(testOutput).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'INFO',
        msg: 'Testing clone',
      })
    );
    expect(testOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'INFO',
        msg: '[CLONED] Testing clone',
      })
    );
  });

  test('parseLogLevel', () => {
    expect(parseLogLevel('DEbug')).toBe(LogLevel.DEBUG);
    expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
    expect(parseLogLevel('none')).toBe(LogLevel.NONE);
    expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
    expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
    expect(() => {
      parseLogLevel('foo');
    }).toThrow('Invalid log level: foo');
  });
});
