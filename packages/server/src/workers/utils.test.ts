// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Subscription } from '@medplum/fhirtypes';
import type { Job, QueueOptions, Worker } from 'bullmq';
import { DelayedError, Queue } from 'bullmq';
import EventEmitter from 'node:events';
import type { MockInstance } from 'vitest';
import { vi } from 'vitest';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig, WorkerName } from '../config/types';
import { globalLogger } from '../logger';
import * as otelModule from '../otel/otel';
import { withTestContext } from '../test.setup';
import {
  addVerboseQueueLogging,
  applyGlobalConcurrency,
  DefaultQueueRegistry,
  getWorkerBullmqConfig,
  isJobSuccessful,
  trackJobMetrics,
} from './utils';

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

    test('Successful job with invalid custom codes', async () => {
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
      await withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(true));
    });

    test('Unsuccessful job with invalid custom codes', async () => {
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
      await withTestContext(() => expect(isJobSuccessful(subscription, 500)).toBe(false));
    });

    test('Successful job with valid custom codes', async () => {
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
      await withTestContext(() => expect(isJobSuccessful(subscription, 500)).toBe(true));
    });

    test('Unsuccessful job with valid custom codes', async () => {
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
      await withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(false));
    });

    test('Successful job with valid custom codes comma separated', async () => {
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
      await withTestContext(() => expect(isJobSuccessful(subscription, 200)).toBe(true));
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

      close = vi.fn();
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
      await queueRegistry.closeAll();
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
      vi.clearAllMocks();
      await queueRegistry.closeAll();
      expect(queue.close).not.toHaveBeenCalled();
      expect(worker.close).not.toHaveBeenCalled();
      expect(queue2.close).not.toHaveBeenCalled();
      expect(worker2.close).not.toHaveBeenCalled();

      // attempting to emit the closing event after closing shouldn't fail or throw
      worker.emit('closing', 'artificially emitting');

      // still able to add new queues
      queueRegistry.add(queueName, queue, worker);
      expect(queueRegistry.get(queueName)).toBe(queue);
      expect(queueRegistry.isClosing(queueName)).toBe(false);
    });

    test('add with worker undefined (queue-only mode)', async () => {
      const queueRegistry = new DefaultQueueRegistry();

      // Should not throw when worker is undefined
      queueRegistry.add(queueName, queue, undefined);
      expect(queueRegistry.get(queueName)).toBe(queue);
      expect(queueRegistry.isClosing(queueName)).toBe(false);

      // closeAll should close only the queue (no worker to close)
      await queueRegistry.closeAll();
      expect(queue.close).toHaveBeenCalledTimes(1);

      // queue should be removed from registry after closeAll
      expect(queueRegistry.get(queueName)).toBeUndefined();
    });
  });

  describe('addVerboseQueueLogging', () => {
    test('logs appropriate messages for each worker event', () => {
      const queueName = 'TestLoggingQueue';
      // const queue = new Queue(queueName);
      const queue = { name: queueName } as Queue;
      const worker = new EventEmitter() as unknown as Worker;

      const loggerInfoSpy = vi.spyOn(globalLogger, 'info').mockImplementation(() => undefined);

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

  describe('trackJobMetrics', () => {
    const job = { id: 'job-1' } as Job;
    let inFlightSpy: MockInstance<typeof otelModule.addToUpDownCounter>;
    let completedSpy: MockInstance<typeof otelModule.incrementCounter>;

    beforeEach(() => {
      inFlightSpy = vi.spyOn(otelModule, 'addToUpDownCounter');
      completedSpy = vi.spyOn(otelModule, 'incrementCounter');
    });

    afterEach(() => {
      inFlightSpy.mockRestore();
      completedSpy.mockRestore();
    });

    function reportedDeltas(workerName: WorkerName): number[] {
      const metricName = otelModule.getQueueMetricName(workerName, 'inFlightJobs');
      return inFlightSpy.mock.calls.filter((call) => call[0] === metricName).map((call) => call[1]);
    }

    function completions(workerName: WorkerName): number {
      const metricName = otelModule.getQueueMetricName(workerName, 'jobsCompleted');
      return completedSpy.mock.calls.filter((call) => call[0] === metricName).length;
    }

    test('increments while the job runs and decrements once it resolves', async () => {
      const processor = vi.fn(async () => {
        // Mid-flight: the increment has landed, and neither the decrement nor the completion has.
        expect(reportedDeltas('batch')).toStrictEqual([1]);
        expect(completions('batch')).toBe(0);
        return 'result';
      });

      await expect(trackJobMetrics('batch', processor)(job)).resolves.toBe('result');
      expect(reportedDeltas('batch')).toStrictEqual([1, -1]);
      expect(completions('batch')).toBe(1);
    });

    test('decrements and rethrows when the job fails, without counting a completion', async () => {
      const processor = vi.fn().mockRejectedValue(new Error('job blew up'));

      await expect(trackJobMetrics('cron', processor)(job)).rejects.toThrow('job blew up');
      expect(reportedDeltas('cron')).toStrictEqual([1, -1]);
      expect(completions('cron')).toBe(0);
    });

    test('does not count a completion for a job re-queued as delayed', async () => {
      // moveToDelayedAndThrow throws DelayedError; the attempt that finally runs to the end counts.
      const processor = vi.fn().mockRejectedValue(new DelayedError('queue is closing'));

      await expect(trackJobMetrics('batch', processor)(job)).rejects.toThrow(DelayedError);
      expect(reportedDeltas('batch')).toStrictEqual([1, -1]);
      expect(completions('batch')).toBe(0);
    });

    test('names both metrics after the worker, matching the other per-queue metrics', async () => {
      await trackJobMetrics('subscription', async () => undefined)(job);

      const expectedOptions = { attributes: otelModule.BASE_METRIC_OPTIONS.attributes };
      expect(inFlightSpy).toHaveBeenCalledWith('medplum.subscription.inFlightJobs', 1, expectedOptions);
      expect(completedSpy).toHaveBeenCalledWith('medplum.subscription.jobsCompleted', expectedOptions);
    });

    test('forwards all processor arguments and preserves arity', async () => {
      const processor = vi.fn().mockResolvedValue(undefined);
      const wrapped = trackJobMetrics('download', processor);
      const signal = new AbortController().signal;

      // BullMQ reads `processor.length >= 3` to decide whether to supply an abort signal, so the
      // wrapper must keep all three parameters.
      expect(wrapped.length).toBe(3);

      await wrapped(job, 'token-1', signal);
      expect(processor).toHaveBeenCalledWith(job, 'token-1', signal);
    });
  });

  describe('applyGlobalConcurrency', () => {
    test('sets global concurrency when configured', async () => {
      const setGlobalConcurrency = vi.fn().mockResolvedValue(5);
      const removeGlobalConcurrency = vi.fn().mockResolvedValue(0);
      const queue = { name: 'TestQueue', setGlobalConcurrency, removeGlobalConcurrency } as unknown as Queue;

      await applyGlobalConcurrency(queue, { globalConcurrency: 5 });
      expect(setGlobalConcurrency).toHaveBeenCalledWith(5);
      expect(removeGlobalConcurrency).not.toHaveBeenCalled();
    });

    test('removes global concurrency when not configured', async () => {
      const setGlobalConcurrency = vi.fn().mockResolvedValue(5);
      const removeGlobalConcurrency = vi.fn().mockResolvedValue(0);
      const queue = { name: 'TestQueue', setGlobalConcurrency, removeGlobalConcurrency } as unknown as Queue;

      await applyGlobalConcurrency(queue, { concurrency: 10 });
      expect(removeGlobalConcurrency).toHaveBeenCalledTimes(1);
      expect(setGlobalConcurrency).not.toHaveBeenCalled();
    });

    test('removes global concurrency when config is undefined', async () => {
      const setGlobalConcurrency = vi.fn().mockResolvedValue(5);
      const removeGlobalConcurrency = vi.fn().mockResolvedValue(0);
      const queue = { name: 'TestQueue', setGlobalConcurrency, removeGlobalConcurrency } as unknown as Queue;

      await applyGlobalConcurrency(queue, undefined);
      expect(removeGlobalConcurrency).toHaveBeenCalledTimes(1);
      expect(setGlobalConcurrency).not.toHaveBeenCalled();
    });

    test('rejects when the underlying call fails', async () => {
      const err = new Error('redis down');
      const setGlobalConcurrency = vi.fn().mockRejectedValue(err);
      const queue = { name: 'TestQueue', setGlobalConcurrency } as unknown as Queue;

      await expect(applyGlobalConcurrency(queue, { globalConcurrency: 3 })).rejects.toThrow('redis down');
    });
  });

  describe('getWorkerBullmqConfig', () => {
    const defaultOptions: QueueOptions = { connection: { host: 'test-redis' } };

    test('returns default options plus global bullmq config when no per-worker overrides', () => {
      const config = {
        bullmq: { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 } },
      } as MedplumServerConfig;

      const result = getWorkerBullmqConfig(config, 'subscription', defaultOptions);
      expect(result).toStrictEqual({ ...defaultOptions, ...config.bullmq });
    });

    test('returns default options plus global bullmq config when workers config exists but no bullmq overrides for this worker', () => {
      const config = {
        bullmq: { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 } },
        workers: { enabled: ['subscription'] },
      } as MedplumServerConfig;

      const result = getWorkerBullmqConfig(config, 'subscription', defaultOptions);
      expect(result).toStrictEqual({ ...defaultOptions, ...config.bullmq });
    });

    test('merges per-worker bullmq overrides on top of global config', () => {
      const config = {
        bullmq: { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 } },
        workers: {
          bullmq: {
            subscription: { concurrency: 50 },
          },
        },
      } as MedplumServerConfig;

      const result = getWorkerBullmqConfig(config, 'subscription', defaultOptions);
      expect(result).toStrictEqual({
        ...defaultOptions,
        concurrency: 50,
        removeOnComplete: { count: 1 },
        removeOnFail: { count: 1 },
      });
    });

    test('worker defaults supersede global bullmq config', () => {
      const config = {
        bullmq: { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 } },
      } as MedplumServerConfig;

      const result = getWorkerBullmqConfig(config, 'batch', defaultOptions, { concurrency: 1 });
      expect(result).toStrictEqual({
        ...defaultOptions,
        concurrency: 1,
        removeOnComplete: { count: 1 },
        removeOnFail: { count: 1 },
      });
    });

    test('per-worker overrides supersede worker defaults', () => {
      const config = {
        bullmq: { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 } },
        workers: {
          bullmq: {
            batch: { concurrency: 5 },
          },
        },
      } as MedplumServerConfig;

      const result = getWorkerBullmqConfig(config, 'batch', defaultOptions, { concurrency: 1 });
      expect(result).toStrictEqual({
        ...defaultOptions,
        concurrency: 5,
        removeOnComplete: { count: 1 },
        removeOnFail: { count: 1 },
      });
    });

    test('per-worker overrides do not affect other workers', () => {
      const config = {
        bullmq: { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 } },
        workers: {
          bullmq: {
            subscription: { concurrency: 50 },
          },
        },
      } as MedplumServerConfig;

      const result = getWorkerBullmqConfig(config, 'download', defaultOptions);
      expect(result).toStrictEqual({ ...defaultOptions, ...config.bullmq });
    });
  });
});
