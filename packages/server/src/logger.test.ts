import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import fs from 'fs';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { loadConfig } from './config';
import { LogLevel, logger } from './logger';
import { waitFor } from './test.setup';

describe('Logger', () => {
  let mockCloudWatchLogsClient: AwsClientStub<CloudWatchLogsClient>;

  beforeEach(() => {
    mockCloudWatchLogsClient = mockClient(CloudWatchLogsClient);

    mockCloudWatchLogsClient.on(CreateLogGroupCommand).resolves({});
    mockCloudWatchLogsClient.on(CreateLogStreamCommand).resolves({});
    mockCloudWatchLogsClient.on(PutLogEventsCommand).resolves({
      nextSequenceToken: '',
      rejectedLogEventsInfo: {},
    });
  });

  afterEach(() => {
    mockCloudWatchLogsClient.restore();
  });

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

    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ logAuditEvents: false }));

    await loadConfig('file:test.json');

    logger.logAuditEvent({ resourceType: 'AuditEvent' });

    expect(console.info).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  test('AuditEvent to console.log', async () => {
    console.log = jest.fn();

    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ logAuditEvents: true }));
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
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
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

    await waitFor(async () => expect(mockCloudWatchLogsClient).toHaveReceivedCommand(PutLogEventsCommand));

    // CloudWatch logs should have been created
    expect(mockCloudWatchLogsClient.send.callCount).toBe(3);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogGroupCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogStreamCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(PutLogEventsCommand, 1);

    expect(console.info).toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
