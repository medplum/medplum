import { randomUUID } from 'crypto';
import { LogLevel, Logger, parseLogLevel } from './logger';

describe('Logger', () => {
  let testLogger: Logger;
  let testOutput: jest.Mock<void, [Record<string, any>]>;

  beforeEach(() => {
    testOutput = jest.fn();
    testLogger = new Logger((msg) => testOutput(JSON.parse(msg)), undefined, LogLevel.DEBUG);
  });

  test('Writes simple message to output as JSON', () => {
    testLogger.info('Boing!');
    expect(testOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        msg: 'Boing!',
      })
    );
  });

  test('Formats error message', () => {
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
