import { logger, LogLevel } from './logger';

describe('Logger', () => {
  test('Debug', () => {
    console.log = jest.fn();

    logger.level = LogLevel.NONE;
    logger.debug('test');
    expect(console.log).not.toHaveBeenCalled();

    logger.level = LogLevel.DEBUG;
    logger.debug('test');
    expect(console.log).toHaveBeenCalledWith('DEBUG', expect.anything(), 'test');
  });

  test('Info', () => {
    console.log = jest.fn();

    logger.level = LogLevel.NONE;
    logger.info('test');
    expect(console.log).not.toHaveBeenCalled();

    logger.level = LogLevel.INFO;
    logger.info('test');
    expect(console.log).toHaveBeenCalledWith('INFO', expect.anything(), 'test');
  });

  test('Warn', () => {
    console.log = jest.fn();

    logger.level = LogLevel.NONE;
    logger.warn('test');
    expect(console.log).not.toHaveBeenCalled();

    logger.level = LogLevel.WARN;
    logger.warn('test');
    expect(console.log).toHaveBeenCalledWith('WARN', expect.anything(), 'test');
  });

  test('Error', () => {
    console.log = jest.fn();

    logger.level = LogLevel.NONE;
    logger.error('test');
    expect(console.log).not.toHaveBeenCalled();

    logger.level = LogLevel.ERROR;
    logger.error('test');
    expect(console.log).toHaveBeenCalledWith('ERROR', expect.anything(), 'test');
  });
});
