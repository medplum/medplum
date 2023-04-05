import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { loadTestConfig } from '../config';
import { waitFor } from '../test.setup';
import { CloudWatchLogger } from './cloudwatch';

jest.mock('@aws-sdk/client-cloudwatch-logs');

describe('CloudWatch Logs', () => {
  beforeEach(async () => {
    console.error = jest.fn();
    console.info = jest.fn();

    (CloudWatchLogsClient as unknown as jest.Mock).mockClear();
    (CreateLogGroupCommand as unknown as jest.Mock).mockClear();
    (CreateLogStreamCommand as unknown as jest.Mock).mockClear();
    (PutLogEventsCommand as unknown as jest.Mock).mockClear();

    await loadTestConfig();
  });

  test('Simple log', async () => {
    const cwl = new CloudWatchLogger('us-east-1', 'test-group', 'test-stream');
    cwl.write('x');
    cwl.write('y');
    await waitFor(() => expect(PutLogEventsCommand).toHaveBeenCalled());
    expect(CloudWatchLogsClient).toHaveBeenCalledTimes(1);
    expect(CreateLogGroupCommand).toHaveBeenCalledTimes(1);
    expect(CreateLogStreamCommand).toHaveBeenCalledTimes(1);
    expect(PutLogEventsCommand).toHaveBeenCalledTimes(1);
  });

  test('More than 10k events', async () => {
    const cwl = new CloudWatchLogger('us-east-1', 'test-group', 'test-stream');
    for (let i = 0; i < 10001; i++) {
      cwl.write(i.toString());
    }
    await waitFor(() => expect(PutLogEventsCommand).toHaveBeenCalled());
    expect(CloudWatchLogsClient).toHaveBeenCalledTimes(1);
    expect(CreateLogGroupCommand).toHaveBeenCalledTimes(1);
    expect(CreateLogStreamCommand).toHaveBeenCalledTimes(1);
    expect(PutLogEventsCommand).toHaveBeenCalledTimes(2);
  });

  test('More than 1mb of data', async () => {
    const cwl = new CloudWatchLogger('us-east-1', 'test-group', 'test-stream');
    cwl.write('x'.repeat(512 * 1024));
    cwl.write('y'.repeat(512 * 1024));
    await waitFor(() => expect(PutLogEventsCommand).toHaveBeenCalled());
    expect(CloudWatchLogsClient).toHaveBeenCalledTimes(1);
    expect(CreateLogGroupCommand).toHaveBeenCalledTimes(1);
    expect(CreateLogStreamCommand).toHaveBeenCalledTimes(1);
    expect(PutLogEventsCommand).toHaveBeenCalledTimes(2);
  });
});
