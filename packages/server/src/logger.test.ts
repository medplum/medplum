import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import fs from 'fs';
import { loadConfig } from './config';
import { LogLevel, logger } from './logger';
import { waitFor } from './test.setup';

jest.mock('@aws-sdk/client-cloudwatch-logs');
jest.mock('fs');

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

  test('AuditEvents disabled', async () => {
    console.info = jest.fn();
    console.log = jest.fn();

    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(JSON.stringify({ logAuditEvents: false }));
    await loadConfig('file:test.json');

    logger.logAuditEvent({ resourceType: 'AuditEvent' });

    expect(console.info).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  test('AuditEvent to console.log', async () => {
    console.log = jest.fn();

    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(JSON.stringify({ logAuditEvents: true }));
    await loadConfig('file:test.json');

    // Log an AuditEvent
    logger.logAuditEvent({ resourceType: 'AuditEvent' });

    // It should have been logged
    expect(console.log).toHaveBeenCalledWith('{"resourceType":"AuditEvent"}');
  });

  test('AuditEvent to CloudWatch Logs', async () => {
    console.info = jest.fn();
    console.log = jest.fn();

    // Mock readFileSync for custom config file
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(
      JSON.stringify({
        logAuditEvents: true,
        auditEventLogGroup: 'test-log-group',
        auditEventLogStream: 'test-log-stream',
      })
    );
    await loadConfig('file:test.json');

    // Log an AuditEvent
    logger.logAuditEvent({ resourceType: 'AuditEvent' });
    logger.logAuditEvent({ resourceType: 'AuditEvent' });

    await waitFor(async () => expect(PutLogEventsCommand).toHaveBeenCalled());

    // CloudWatch logs should have been created
    expect(CloudWatchLogsClient).toHaveBeenCalled();
    expect(CreateLogGroupCommand).toHaveBeenCalled();
    expect(CreateLogStreamCommand).toHaveBeenCalled();
    expect(PutLogEventsCommand).toHaveBeenCalled();

    expect(console.info).toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
