// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Subscription } from '@medplum/fhirtypes';
import { Job, Queue, Worker } from 'bullmq';
import EventEmitter from 'node:events';
import { loadTestConfig } from '../config/loader';
import { globalLogger } from '../logger';
import { withTestContext } from '../test.setup';
import { addVerboseQueueLogging, DefaultQueueRegistry, isJobSuccessful } from './utils';

describe('worker utils', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  describe('isJobSuccessful', () => {
    test('Successful job with no custom codes', () => {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
      };
      expect(isJobSuccessful(subscription, 200)).toBe(true);
    });

    test('Successful job with invalid custom codes', () => {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
            valueString: '123, fda-fda',
          },
        ],
      };
      withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(true));
    });

    test('Unsuccessful job with invalid custom codes', () => {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
            valueString: '1a,asd,fda-fda',
          },
        ],
      };
      withTestContext(() => expect(isJobSuccessful(subscription, 500)).toBe(false));
    });

    test('Successful job with valid custom codes', () => {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
            valueString: '200,300,400-505',
          },
        ],
      };
      withTestContext(() => expect(isJobSuccessful(subscription, 500)).toBe(true));
    });

    test('Unsuccessful job with valid custom codes', () => {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
            valueString: '300,400-505',
          },
        ],
      };
      withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(false));
    });

    test('Successful job with valid custom codes comma separated', () => {
      const subscription: Subscription = {
        resourceType: 'Subscription',
        status: 'active',
        reason: 'test',
        criteria: 'Patient',
        channel: {
          type: 'rest-hook',
          endpoint: 'https://example.com/subscription',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/subscription-success-codes',
            valueString: '200, 204',
          },
        ],
      };
      withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(true));
    });
  });

  describe('QueueRegistry', () => {
    const queueName = 'TestQueue';
    const workerName = 'TestWorker';
    let queue: Queue;
    let worker: Worker;

    class MockWorker extends EventEmitter {
      readonly name: string;

      constructor(name: string) {
        super();
        this.name = name;
      }

      close = jest.fn();
    }

    beforeEach(() => {
      queue = new Queue(queueName);
      worker = new MockWorker(workerName) as unknown as Worker;
    });

    test('expected behavior', async () => {
      const queueRegistry = new DefaultQueueRegistry();

      queueRegistry.add(queueName, queue, worker);
      expect(queueRegistry.get(queueName)).toBe(queue);
      expect(queueRegistry.isClosing(queueName)).toBe(false);

      // adding with same name throws
      expect(() => queueRegistry.add(queueName, queue, worker)).toThrow(`Queue ${queueName} already registered`);

      // existing queue is still registered
      expect(queueRegistry.get(queueName)).toBe(queue);
      expect(queueRegistry.isClosing(queueName)).toBe(false);

      // Add second queue
      const queue2 = new Queue(queueName + '2');
      const worker2 = new MockWorker(workerName + '2') as unknown as Worker;
      queueRegistry.add(queueName + '2', queue2, worker2);

      // expected getters
      expect(queueRegistry.get(queueName)).toBe(queue);
      expect(queueRegistry.isClosing(queueName)).toBe(false);
      expect(queueRegistry.get(queueName + '2')).toBe(queue2);
      expect(queueRegistry.isClosing(queueName + '2')).toBe(false);

      // emit closing event
      worker.emit('closing', 'artificially emitting');

      // only first queue isClosing should be true
      expect(queueRegistry.isClosing(queueName)).toBe(true);
      expect(queueRegistry.isClosing(queueName + '2')).toBe(false);

      // sanity check close not called
      expect(queue.close).not.toHaveBeenCalled();
      expect(worker.close).not.toHaveBeenCalled();
      expect(queue2.close).not.toHaveBeenCalled();
      expect(worker2.close).not.toHaveBeenCalled();

      // closeAll should close all queues
      let promises = queueRegistry.closeAll();
      expect(promises.length).toBe(2);
      await Promise.all(promises);
      expect(queue.close).toHaveBeenCalledTimes(1);
      expect(worker.close).toHaveBeenCalledTimes(1);
      expect(queue2.close).toHaveBeenCalledTimes(1);
      expect(worker2.close).toHaveBeenCalledTimes(1);

      // queues should be removed from registry after closeAll
      expect(queueRegistry.get(queueName)).toBeUndefined();
      expect(queueRegistry.isClosing(queueName)).toBeUndefined();
      expect(queueRegistry.get(queueName + '2')).toBeUndefined();
      expect(queueRegistry.isClosing(queueName + '2')).toBeUndefined();

      // nothing to close
      promises = queueRegistry.closeAll();
      expect(promises.length).toBe(0);

      // attempting to emit the closing event after closing shouldn't fail or throw
      worker.emit('closing', 'artificially emitting');

      // still able to add new queues
      queueRegistry.add(queueName, queue, worker);
      expect(queueRegistry.get(queueName)).toBe(queue);
      expect(queueRegistry.isClosing(queueName)).toBe(false);
    });
  });

  describe('addVerboseQueueLogging', () => {
    test('logs appropriate messages for each worker event', () => {
      const queueName = 'TestLoggingQueue';
      // const queue = new Queue(queueName);
      const queue = { name: queueName } as Queue;
      const worker = new EventEmitter() as unknown as Worker;

      const loggerInfoSpy = jest.spyOn(globalLogger, 'info').mockImplementation();

      addVerboseQueueLogging<any>(queue, worker, (job) => ({ asyncJob: 'AsyncJob/' + job.data.asyncJobId }));

      const job = {
        id: '123',
        timestamp: Date.now(),
        processedOn: Date.now(),
        data: {
          asyncJobId: 'job-456',
          type: 'test-job-type',
        },
        attemptsMade: 0,
        attemptsStarted: 1,
      } as Job & { id: string };

      // Trigger each event and verify logging
      worker.emit('active', job, 'previous-state');
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: active`, {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        attemptsStarted: job.attemptsStarted,
        asyncJob: 'AsyncJob/' + job.data.asyncJobId,
        prev: 'previous-state',
      });
      loggerInfoSpy.mockClear();

      worker.emit('closing', 'shutdown-message');
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: closing`, {
        message: 'shutdown-message',
      });
      loggerInfoSpy.mockClear();

      worker.emit('closed');
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: closed`);
      loggerInfoSpy.mockClear();

      // These are changes that BullMQ would usually make
      job.finishedOn = Date.now();
      job.attemptsMade = 1;

      worker.emit('completed', job, 'job-result', 'previous-state');
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: completed`, {
        jobId: job.id,
        jobTimestamp: job.timestamp,
        attemptsMade: 1,
        attemptsStarted: 1,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        queuedDurationMs: expect.any(Number),
        executionDurationMs: expect.any(Number),
        totalDurationMs: expect.any(Number),
        asyncJob: 'AsyncJob/' + job.data.asyncJobId,
        result: 'job-result',
        prev: 'previous-state',
      });
      loggerInfoSpy.mockClear();

      const testError = new Error('test error message');
      worker.emit('error', testError);
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: error`, {
        error: testError.message,
        stack: testError.stack,
      });
      loggerInfoSpy.mockClear();

      worker.emit('failed', job, testError, 'previous-state');
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: failed`, {
        jobId: job.id,
        jobTimestamp: job.timestamp,
        attemptsMade: 1,
        attemptsStarted: 1,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        queuedDurationMs: expect.any(Number),
        executionDurationMs: expect.any(Number),
        totalDurationMs: expect.any(Number),
        asyncJob: 'AsyncJob/' + job.data.asyncJobId,
        prev: 'previous-state',
        error: testError.message,
        stack: testError.stack,
      });
      loggerInfoSpy.mockClear();

      worker.emit('stalled', job.id, 'previous-state');
      expect(loggerInfoSpy).toHaveBeenCalledWith(`${queueName} worker: stalled`, {
        jobId: job.id,
        prev: 'previous-state',
      });
      loggerInfoSpy.mockClear();

      // Restore the spy
      loggerInfoSpy.mockRestore();
    });
  });
});
