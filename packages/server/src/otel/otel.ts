// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Queue } from 'bullmq';
import os from 'node:os';
import v8 from 'node:v8';
import { DatabaseMode, getDatabasePool, getReservedDatabaseConnectionCount } from '../database';
import { getDatabaseMetricOptions } from '../database-metrics';
import { heartbeat } from '../heartbeat';
import { getBatchQueue } from '../workers/batch';
import { getCronQueue } from '../workers/cron';
import { getDownloadQueue } from '../workers/download';
import { getSetAccountsQueue } from '../workers/set-accounts';
import { getSubscriptionQueue } from '../workers/subscription';
import type { RecordMetricOptions } from './metrics';
import { setGauge } from './metrics';

export { getCounter, getGauge, getHistogram, incrementCounter, recordHistogramValue, setGauge } from './metrics';
export type { RecordMetricOptions } from './metrics';

let queueEntries: [string, Queue][] | undefined;
function getQueueEntries(): [string, Queue][] {
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
const BASE_METRIC_OPTIONS = { attributes: { hostname } } satisfies RecordMetricOptions;
let otelHeartbeatListener: (() => Promise<void>) | undefined;

export function initOtelHeartbeat(): void {
  if (otelHeartbeatListener) {
    return;
  }
  otelHeartbeatListener = async () => {
    const writerPool = getDatabasePool(DatabaseMode.WRITER);
    const readerPool = getDatabasePool(DatabaseMode.READER);

    const writerMetricOptions = getDatabaseMetricOptions('writer');
    setGauge('medplum.db.totalConnections', writerPool.totalCount, writerMetricOptions);
    setGauge('medplum.db.idleConnections', writerPool.idleCount, writerMetricOptions);
    setGauge('medplum.db.queriesAwaitingClient', writerPool.waitingCount, writerMetricOptions);
    setGauge(
      'medplum.db.reservedConnections',
      getReservedDatabaseConnectionCount(DatabaseMode.WRITER),
      writerMetricOptions
    );

    if (writerPool !== readerPool) {
      const readerMetricOptions = getDatabaseMetricOptions('reader');
      setGauge('medplum.db.totalConnections', readerPool.totalCount, readerMetricOptions);
      setGauge('medplum.db.idleConnections', readerPool.idleCount, readerMetricOptions);
      setGauge('medplum.db.queriesAwaitingClient', readerPool.waitingCount, readerMetricOptions);
      setGauge(
        'medplum.db.reservedConnections',
        getReservedDatabaseConnectionCount(DatabaseMode.READER),
        readerMetricOptions
      );
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
        setGauge(`medplum.${queueName}.waitingCount`, await queue.getWaitingCount());
        setGauge(`medplum.${queueName}.delayedCount`, await queue.getDelayedCount());
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
