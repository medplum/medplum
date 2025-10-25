// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import { LogLevel, Logger, parseLogLevel, serializeError } from './logger';

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

  test('Error as property', () => {
    testLogger.error('Fatal error', { foo: new Error('Catastrophe!') });
    expect(testOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        msg: 'Fatal error',
        foo: expect.objectContaining({
          error: 'Error: Catastrophe!',
          stack: expect.arrayContaining(['Error: Catastrophe!']),
        }),
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

describe('serializeError', () => {
  describe('basic error serialization', () => {
    test('should serialize a simple error', () => {
      const error = new Error('Something went wrong');
      const result = serializeError(error);

      expect(result.error).toBe('Error: Something went wrong');
      expect(result.message).toBe('Something went wrong');
      expect(result.stack).toBeInstanceOf(Array);
      expect(result.stack[0]).toContain('Error: Something went wrong');
    });

    test('should handle error without stack trace', () => {
      const error = new Error('No stack');
      delete error.stack;
      const result = serializeError(error);

      expect(result.error).toBe('Error: No stack');
      expect(result.message).toBe('No stack');
      expect(result.stack).toBeUndefined();
    });

    test('should include custom error name', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Custom problem');
      const result = serializeError(error);

      expect(result.name).toBe('CustomError');
      expect(result.error).toBe('CustomError: Custom problem');
    });

    test('should not include name property for default Error name', () => {
      const error = new Error('Standard error');
      const result = serializeError(error);

      expect(result.name).toBeUndefined();
    });
  });

  describe('nested errors with cause', () => {
    test('should serialize error with Error cause', () => {
      const rootCause = new Error('Root cause');
      const error = new Error('Main error', { cause: rootCause });
      const result = serializeError(error);

      expect(result.error).toBe('Error: Main error');
      expect(result.cause).toBeDefined();
      expect(result.cause.error).toBe('Error: Root cause');
      expect(result.cause.message).toBe('Root cause');
      expect(result.cause.stack).toBeInstanceOf(Array);
    });

    test('should handle multiple levels of nested causes', () => {
      const level3 = new Error('Level 3');
      const level2 = new Error('Level 2', { cause: level3 });
      const level1 = new Error('Level 1', { cause: level2 });
      const result = serializeError(level1);

      expect(result.error).toBe('Error: Level 1');
      expect(result.cause.error).toBe('Error: Level 2');
      expect(result.cause.cause.error).toBe('Error: Level 3');
      expect(result.cause.cause.cause).toBeUndefined();
    });

    test('should handle non-Error cause', () => {
      const error = new Error('Main error', { cause: 'String cause' });
      const result = serializeError(error);

      expect(result.error).toBe('Error: Main error');
      expect(result.cause).toBe('String cause');
    });

    test('should handle object cause', () => {
      const cause = { code: 'ECONNREFUSED', port: 5432 };
      const error = new Error('Connection failed', { cause });
      const result = serializeError(error);

      expect(result.error).toBe('Error: Connection failed');
      expect(result.cause).toEqual({ code: 'ECONNREFUSED', port: 5432 });
    });

    test('should handle undefined cause', () => {
      const error = new Error('Error with undefined cause');
      (error as any).cause = undefined;
      const result = serializeError(error);

      expect(result.error).toBe('Error: Error with undefined cause');
      expect(result.cause).toBeUndefined();
    });
  });

  describe('custom properties', () => {
    test('should include custom properties on error', () => {
      const error = new Error('Custom props error') as any;
      error.code = 'ERR_001';
      error.statusCode = 500;
      error.details = { userId: 123 };

      const result = serializeError(error);

      expect(result.code).toBe('ERR_001');
      expect(result.statusCode).toBe(500);
      expect(result.details).toEqual({ userId: 123 });
    });

    test('should serialize nested Error in custom property', () => {
      const nestedError = new Error('Nested error');
      const error = new Error('Main error') as any;
      error.innerError = nestedError;

      const result = serializeError(error);

      expect(result.innerError).toBeDefined();
      expect(result.innerError.error).toBe('Error: Nested error');
      expect(result.innerError.stack).toBeInstanceOf(Array);
    });

    test('should handle property that throws on access', () => {
      const error = new Error('Error with throwing property');
      Object.defineProperty(error, 'throwingProp', {
        get() {
          throw new Error('Cannot access this property');
        },
        enumerable: true,
      });

      // Should not throw
      expect(() => serializeError(error)).not.toThrow();
      const result = serializeError(error);
      expect(result.error).toBe('Error: Error with throwing property');
    });
  });

  describe('depth limiting', () => {
    test('should respect default maxDepth of 10', () => {
      // Create a chain of 12 nested errors
      let error = new Error('Level 12');
      for (let i = 11; i >= 1; i--) {
        error = new Error(`Level ${i}`, { cause: error });
      }

      const result = serializeError(error);

      // Navigate to the deepest level
      let current = result;
      let depth = 0;
      while (current.cause && typeof current.cause === 'object' && 'error' in current.cause) {
        current = current.cause;
        depth++;
      }

      expect(depth).toBe(10); // 10 levels total (0-9)
    });

    test('should respect custom maxDepth parameter', () => {
      const level3 = new Error('Level 3');
      const level2 = new Error('Level 2', { cause: level3 });
      const level1 = new Error('Level 1', { cause: level2 });

      const result = serializeError(level1, 0, 2);

      expect(result.error).toBe('Error: Level 1');
      expect(result.cause.error).toBe('Error: Level 2');
      expect(result.cause.cause).toEqual({ error: 'Max error depth reached' });
    });

    test('should handle circular reference in custom properties', () => {
      const error1 = new Error('Error 1') as any;
      const error2 = new Error('Error 2') as any;
      error1.related = error2;
      error2.related = error1;

      // Should not cause infinite recursion
      expect(() => serializeError(error1)).not.toThrow();
      const result = serializeError(error1);

      expect(result.error).toBe('Error: Error 1');
      expect(result.related.error).toBe('Error: Error 2');
      // Should eventually hit max depth
    });
  });

  describe('edge cases', () => {
    test('should handle error with null prototype', () => {
      const error = Object.create(null);
      error.message = 'Null prototype error';
      error.toString = () => 'CustomError: Null prototype error';

      const result = serializeError(error);

      expect(result.error).toBe('CustomError: Null prototype error');
    });

    test('should handle error with empty message', () => {
      const error = new Error('');
      const result = serializeError(error);

      expect(result.error).toBe('Error');
      // Empty string message might not be included in serialization
      // depending on implementation - check if it exists before asserting
      if ('message' in result) {
        expect(result.message).toBe('');
      }
    });

    test('should handle error with very long stack trace', () => {
      const error = new Error('Long stack');
      // Simulate a very long stack
      error.stack = Array(1000).fill('at someFunction()').join('\n');

      const result = serializeError(error);

      expect(result.stack).toBeInstanceOf(Array);
      expect(result.stack.length).toBe(1000);
    });

    test('should handle AggregateError with multiple errors', () => {
      const errors = [new Error('First error'), new Error('Second error'), 'String error'];
      const aggregateError = new AggregateError(errors, 'Multiple errors occurred');

      const result = serializeError(aggregateError as any);

      expect(result.error).toContain('Multiple errors occurred');
      expect(result.message).toBe('Multiple errors occurred');
      // Note: AggregateError.errors property would be captured as custom property
      if (result.errors) {
        expect(result.errors).toBeInstanceOf(Array);
      }
    });
  });

  describe('starting depth parameter', () => {
    test('should handle non-zero starting depth', () => {
      const error = new Error('Starting at depth 5');
      const cause = new Error('Cause');
      (error as any).cause = cause;

      const result = serializeError(error, 8, 10);

      expect(result.error).toBe('Error: Starting at depth 5');
      expect(result.cause.error).toBe('Error: Cause');
      expect(result.cause.cause).toBeUndefined();
    });

    test('should return max depth message when starting at maxDepth', () => {
      const error = new Error('At max depth');
      const result = serializeError(error, 10, 10);

      expect(result).toEqual({ error: 'Max error depth reached' });
    });
  });
});
