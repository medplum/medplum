// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import opentelemetry, { Attributes, Counter, Gauge, Histogram, Meter, MetricOptions } from '@opentelemetry/api';
import os from 'node:os';
import v8 from 'node:v8';
import { DatabaseMode, getDatabasePool } from '../database';
import { heartbeat } from '../heartbeat';
import { getCronQueue } from '../workers/cron';
import { getSubscriptionQueue } from '../workers/subscription';

// This file includes OpenTelemetry helpers.
// Note that this file is related but separate from the OpenTelemetry initialization code in instrumentation.ts.
// The instrumentation.ts code is used to initialize OpenTelemetry.
// This file is used to record metrics.

const hostname = os.hostname();
const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
let otelHeartbeatListener: (() => Promise<void>) | undefined;

let meter: Meter | undefined = undefined;
const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

export type RecordMetricOptions = {
  attributes?: Attributes;
  options?: MetricOptions;
};

function getMeter(): Meter {
  if (!meter) {
    meter = opentelemetry.metrics.getMeter('medplum');
  }
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

    setGauge('medplum.db.idleConnections', writerPool.idleCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
    });
    setGauge('medplum.db.queriesAwaitingClient', writerPool.waitingCount, {
      ...BASE_METRIC_OPTIONS,
      attributes: { ...BASE_METRIC_OPTIONS.attributes, dbInstanceType: 'writer' },
    });

    if (writerPool !== readerPool) {
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

    const subscriptionQueue = getSubscriptionQueue();
    if (subscriptionQueue) {
      setGauge('medplum.subscription.waitingCount', await subscriptionQueue.getWaitingCount());
      setGauge('medplum.subscription.delayedCount', await subscriptionQueue.getDelayedCount());
    }

    const cronQueue = getCronQueue();
    if (cronQueue) {
      setGauge('medplum.cron.waitingCount', await cronQueue.getWaitingCount());
      setGauge('medplum.cron.delayedCount', await cronQueue.getDelayedCount());
    }
  };
  heartbeat.addEventListener('heartbeat', otelHeartbeatListener);
}

export function cleanupOtelHeartbeat(): void {
  if (otelHeartbeatListener) {
    heartbeat.removeEventListener('heartbeat', otelHeartbeatListener);
    otelHeartbeatListener = undefined;
  }
}
