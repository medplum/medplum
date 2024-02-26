import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  InputLogEvent,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-cloudwatch-logs';
import { hostname } from 'os';

/** @deprecated */
interface LogEvent extends InputLogEvent {
  readonly message: string;
  readonly timestamp: number;
}

/** @deprecated */
export class CloudWatchLogger {
  private client: CloudWatchLogsClient;
  private queue: LogEvent[];
  private initPromise?: Promise<void>;
  private timer?: NodeJS.Timeout;

  constructor(
    region: string,
    private logGroupName: string,
    private logStreamName: string = hostname()
  ) {
    this.client = new CloudWatchLogsClient({ region });
    this.queue = [];
  }

  write(message: string): void {
    this.queue.push({ message, timestamp: new Date().getTime() });
    if (!this.timer) {
      this.timer = setTimeout(() => this.handleTimer(), 1000);
    }
  }

  private handleTimer(): void {
    const eventsToSend = this.queue;
    this.queue = [];
    this.timer = undefined;
    this.init()
      .then(() => this.processEvents(eventsToSend))
      .catch(console.error);
  }

  /**
   * Initializes the AWS CloudWatch Log Group and Log Stream.
   * Ensures that initialization only happens once.
   * @returns The promise to the initialization logic.
   */
  private init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.createLogGroup().then(() => this.createLogStream());
    }
    return this.initPromise;
  }

  /**
   * Creates an AWS CloudWatch Logs Group.
   * Handles the case where the log group already exists.
   */
  private async createLogGroup(): Promise<void> {
    try {
      await this.client.send(new CreateLogGroupCommand({ logGroupName: this.logGroupName }));
      console.info('Created log group', this.logGroupName);
    } catch (err) {
      if (err instanceof ResourceAlreadyExistsException) {
        console.info('Log group already exists', this.logGroupName);
      } else {
        console.error('Error creating log group', err);
      }
    }
  }

  /**
   * Creates an AWS CloudWatch Logs Stream.
   * Handles the case where the log stream already exists.
   */
  private async createLogStream(): Promise<void> {
    try {
      await this.client.send(
        new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
        })
      );
      console.info('Created log stream', this.logStreamName);
    } catch (err) {
      if (err instanceof ResourceAlreadyExistsException) {
        console.info('Log stream already exists', this.logStreamName);
      } else {
        console.error('Error creating log stream', err);
      }
    }
  }

  /**
   * Processes the entire queue of events at the time of the timer.
   *
   * It is extremely inefficient to only send one CloudWatch LogEvent at a time.
   *
   * AWS recommends batching the events together into a single API call.
   *
   * However, there are also constraints on the size of the batch.
   *
   * This method takes the full queue and splits it into acceptable batches.
   *
   * In the common case, one call to processEvents will result in one call to putEvents.
   * @param logEvents - All of the events in the queue at the time of the timer.
   */
  private async processEvents(logEvents: LogEvent[]): Promise<void> {
    // Build batches with  CloudWatch Logs constraints:
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-cloudwatch-logs/classes/putlogeventscommand.html
    //
    // Most relevant constraints:
    // 1. The maximum batch size is 1,048,576 bytes. This size is calculated as the sum of all event messages in UTF-8, plus 26 bytes for each log event.
    // 2. The log events in the batch must be in chronological order by their timestamp.
    // 3. The maximum number of log events in a batch is 10,000.
    let start = 0;
    while (start < logEvents.length) {
      let end = start;
      let batchSize = 0;
      while (
        end < logEvents.length &&
        end - start < 10000 &&
        batchSize + logEvents[end].message.length + 26 < 1048576
      ) {
        batchSize += logEvents[end].message.length + 26;
        end++;
      }
      await this.putEvents(logEvents.slice(start, end));
      start = end;
    }
  }

  /**
   * Uploads a batch of events to CloudWatch logs.
   *
   * T?his method assumes that the PutLogEvents constraints are satisfied.
   * @param logEvents - Batch of events for single call to PutLogEvents.
   */
  private async putEvents(logEvents: LogEvent[]): Promise<void> {
    try {
      await this.client.send(
        new PutLogEventsCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
          logEvents,
        })
      );
    } catch (err) {
      console.error('Error uploading log events', err);
    }
  }
}
