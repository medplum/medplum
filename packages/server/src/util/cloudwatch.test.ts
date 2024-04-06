import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { loadTestConfig } from '../config';
import { waitFor } from '../test.setup';
import { CloudWatchLogger } from './cloudwatch';

const region = 'us-east-1';
const logGroupName = 'test-group';
const logStreamName = 'test-stream';

describe('CloudWatch Logs', () => {
  let mockCloudWatchLogsClient: AwsClientStub<CloudWatchLogsClient>;

  beforeEach(async () => {
    console.error = jest.fn();
    console.info = jest.fn();
    mockCloudWatchLogsClient = mockClient(CloudWatchLogsClient);

    await loadTestConfig();
  });

  afterEach(() => {
    mockCloudWatchLogsClient.restore();
  });

  test('Simple log', async () => {
    const cwl = new CloudWatchLogger(region, logGroupName, logStreamName);

    cwl.write('x');
    cwl.write('y');

    await waitFor(async () => expect(mockCloudWatchLogsClient).toHaveReceivedCommand(PutLogEventsCommand));

    expect(mockCloudWatchLogsClient.send.callCount).toBe(3);

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogGroupCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogGroupCommand, { logGroupName });

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogStreamCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogStreamCommand, { logGroupName, logStreamName });

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(PutLogEventsCommand, 1);
  });

  test('More than 10k events', async () => {
    const cwl = new CloudWatchLogger(region, logGroupName, logStreamName);

    for (let i = 0; i < 10001; i++) {
      cwl.write(i.toString());
    }

    await waitFor(async () => expect(mockCloudWatchLogsClient).toHaveReceivedCommand(PutLogEventsCommand));

    expect(mockCloudWatchLogsClient.send.callCount).toBe(4);

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogGroupCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogGroupCommand, { logGroupName });
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogStreamCommand, { logGroupName, logStreamName });

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogStreamCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogGroupCommand, { logGroupName });
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogStreamCommand, { logGroupName, logStreamName });

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(PutLogEventsCommand, 2);
  });

  test('More than 1mb of data', async () => {
    const cwl = new CloudWatchLogger(region, logGroupName, logStreamName);

    cwl.write('x'.repeat(512 * 1024));
    cwl.write('y'.repeat(512 * 1024));

    await waitFor(async () => expect(mockCloudWatchLogsClient).toHaveReceivedCommand(PutLogEventsCommand));

    expect(mockCloudWatchLogsClient.send.callCount).toBe(4);

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogGroupCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogGroupCommand, { logGroupName });
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogStreamCommand, { logGroupName, logStreamName });

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(CreateLogStreamCommand, 1);
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogGroupCommand, { logGroupName });
    expect(mockCloudWatchLogsClient).toHaveReceivedCommandWith(CreateLogStreamCommand, { logGroupName, logStreamName });

    expect(mockCloudWatchLogsClient).toHaveReceivedCommandTimes(PutLogEventsCommand, 2);
  });
});
