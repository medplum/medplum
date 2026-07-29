// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Attributes, Counter, Gauge, Histogram, Meter, MetricOptions, UpDownCounter } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/api';
import type { Queue } from 'bullmq';
import os from 'node:os';
import v8 from 'node:v8';
import type { WorkerName } from '../config/types';
import { DatabaseMode, getDatabasePool } from '../database';
import { heartbeat } from '../heartbeat';
import { getBatchQueue } from '../workers/batch';
import { getCronQueue } from '../workers/cron';
import { getDownloadQueue } from '../workers/download';
import { getSetAccountsQueue } from '../workers/set-accounts';
import { getSubscriptionQueue } from '../workers/subscription';

/**
 * Metrics recorded once per queue.
 *
 * `waitingCount`, `delayedCount` and `activeCount` are gauges the heartbeat reads out of Redis, so
 * they describe the streams backing the queue as the whole cluster sees them -- the metrics for
 * backlog and saturation. `inFlightJobs` (an UpDownCounter moved up as a job starts and down as it
 * settles) and `jobsCompleted` (incremented when a processor returns without throwing) are maintained
 * by the worker itself and describe a single host, which is what makes per-host throughput derivable
 * from them.
 *
 * The two groups are not expected to agree: `activeCount` includes jobs leased by a host that has
 * since died and whose lock has not yet expired, and `jobsCompleted` is a BullMQ-level signal, so a
 * processor that handles a failure internally and returns normally still counts as completed.
 */
export type QueueMetric = 'waitingCount' | 'delayedCount' | 'activeCount' | 'inFlightJobs' | 'jobsCompleted';

/**
 * Builds the name of a per-queue metric.
 *
 * The queue belongs in the metric name rather than an attribute, matching how these have always been
 * reported. Going through here keeps every per-queue metric consistently named and greppable.
 * @param queueName - The queue being measured.
 * @param metric - The quantity being measured.
 * @returns The metric name, e.g. `medplum.batch.activeCount`.
 */
export function getQueueMetricName(queueName: WorkerName, metric: QueueMetric): string {
  return `medplum.${queueName}.${metric}`;
}

let queueEntries: [WorkerName, Queue][] | undefined;
function getQueueEntries(): [WorkerName, Queue][] {
  if (!queueEntries) {
    if (!(getSubscriptionQueue() && getCronQueue() && getDownloadQueue() && getBatchQueue() && getSetAccountsQueue())) {
      throw new Error('Queues not initialized');
    }
    queueEntries = [
      ['subscription', getSubscriptionQueue() as Queue],
      ['cron', getCronQueue() as Queue],
      ['download', getDownloadQueue() as Queue],
      ['batch', getBatchQueue() as Queue],
      ['set-accounts', getSetAccountsQueue() as Queue],
    ];
  }
  return queueEntries;
}

// This file includes OpenTelemetry helpers.
// Note that this file is related but separate from the OpenTelemetry initialization code in instrumentation.ts.
// The instrumentation.ts code is used to initialize OpenTelemetry.
// This file is used to record metrics.

const hostname = os.hostname();
export const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
let otelHeartbeatListener: (() => Promise<void>) | undefined;

let meter: Meter | undefined = undefined;
const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();
const upDownCounters = new Map<string, UpDownCounter>();

export type RecordMetricOptions = {
  attributes?: Attributes;
  options?: MetricOptions;
};

function getMeter(): Meter {
  meter ??= metrics.getMeter('medplum');
  return meter;
}

export function getCounter(name: string, options?: MetricOptions): Counter {
  let result = counters.get(name);
  if (!result) {
    result = getMeter().createCounter(name, options);
    counters.set(name, result);
  }
  return result;
}

export function incrementCounter(name: string, options?: RecordMetricOptions, n = 1): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getCounter(name, options?.options).add(n, options?.attributes);
  return true;
}

export function getHistogram(name: string, options?: MetricOptions): Histogram {
  let result = histograms.get(name);
  if (!result) {
    result = getMeter().createHistogram(name, options);
    histograms.set(name, result);
  }
  return result;
}

export function recordHistogramValue(name: string, value: number, options?: RecordMetricOptions): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getHistogram(name, options?.options).record(value, options?.attributes);
  return true;
}

export function getGauge(name: string, options?: MetricOptions): Gauge {
  let result = gauges.get(name);
  if (!result) {
    result = getMeter().createGauge(name, options);
    gauges.set(name, result);
  }
  return result;
}

export function setGauge(name: string, value: number, options?: RecordMetricOptions): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getGauge(name, options?.options).record(value, options?.attributes);
  return true;
}

export function getUpDownCounter(name: string, options?: MetricOptions): UpDownCounter {
  let result = upDownCounters.get(name);
  if (!result) {
    result = getMeter().createUpDownCounter(name, options);
    upDownCounters.set(name, result);
  }
  return result;
}

/**
 * Adds a signed delta to an UpDownCounter.
 *
 * The collector sums the reported deltas rather than keeping the last value as it would for a gauge,
 * which makes this the instrument for a quantity that rises and falls and is only observable at the
 * moments it changes.
 * @param name - The metric name.
 * @param n - The delta to add. Negative values decrement.
 * @param options - Optional metric attributes and options.
 * @returns True if the delta was recorded, false if metrics are disabled.
 */
export function addToUpDownCounter(name: string, n: number, options?: RecordMetricOptions): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getUpDownCounter(name, options?.options).add(n, options?.attributes);
  return true;
}

function isOtelMetricsEnabled(): boolean {
  return !!process.env.OTLP_METRICS_ENDPOINT;
}

export function initOtelHeartbeat(): void {
  if (otelHeartbeatListener) {
    return;
  }
  otelHeartbeatListener = async () => {
    const writerPool = getDatabasePool(DatabaseMode.WRITER);
    const readerPool = getDatabasePool(DatabaseMode.READER);

    setGauge('medplum.db.totalConnections', writerPool.totalCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
    });
    setGauge('medplum.db.idleConnections', writerPool.idleCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
    });
    setGauge('medplum.db.queriesAwaitingClient', writerPool.waitingCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
    });

    if (writerPool !== readerPool) {
      setGauge('medplum.db.totalConnections', readerPool.totalCount, {
        ...BASE_METRIC_OPTIONS,
        attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'reader' },
      });
      setGauge('medplum.db.idleConnections', readerPool.idleCount, {
        ...BASE_METRIC_OPTIONS,
        attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'reader' },
      });
      setGauge('medplum.db.queriesAwaitingClient', readerPool.waitingCount, {
        ...BASE_METRIC_OPTIONS,
        attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'reader' },
      });
    }

    const heapStats = v8.getHeapStatistics();
    setGauge('medplum.node.usedHeapSize', heapStats.used_heap_size, BASE_METRIC_OPTIONS);

    const heapSpaceStats = v8.getHeapSpaceStatistics();
    setGauge(
      'medplum.node.oldSpaceUsedSize',
      heapSpaceStats.find((entry) => entry.space_name === 'old_space')?.space_used_size ?? -1,
      BASE_METRIC_OPTIONS
    );
    setGauge(
      'medplum.node.newSpaceUsedSize',
      heapSpaceStats.find((entry) => entry.space_name === 'new_space')?.space_used_size ?? -1,
      BASE_METRIC_OPTIONS
    );

    for (const [queueName, queue] of getQueueEntries()) {
      if (queue) {
        setGauge(getQueueMetricName(queueName, 'waitingCount'), await queue.getWaitingCount());
        setGauge(getQueueMetricName(queueName, 'delayedCount'), await queue.getDelayedCount());
        setGauge(getQueueMetricName(queueName, 'activeCount'), await queue.getActiveCount());
      }
    }
  };
  heartbeat.addEventListener('heartbeat', otelHeartbeatListener);
}

export function cleanupOtelHeartbeat(): void {
  if (otelHeartbeatListener) {
    heartbeat.removeEventListener('heartbeat', otelHeartbeatListener);
    otelHeartbeatListener = undefined;
  }
  if (queueEntries) {
    queueEntries = undefined;
  }
}
