import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { AuditEvent } from '@medplum/fhirtypes';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import fs from 'fs';
import { loadConfig } from '../config';
import { waitFor } from '../test.setup';
import { logAuditEvent } from './auditevent';

describe('AuditEvent utils', () => {
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

  test('AuditEvents disabled', async () => {
    console.info = jest.fn();
    console.log = jest.fn();

    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ logAuditEvents: false }));

    await loadConfig('file:test.json');

    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

    expect(console.info).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  test('AuditEvent to console.log', async () => {
    console.log = jest.fn();

    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ logAuditEvents: true }));
    await loadConfig('file:test.json');

    // Log an AuditEvent
    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

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
    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);
    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

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
