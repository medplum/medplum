// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, normalizeErrorString } from '@medplum/core';
import type { BatchInitialState } from '@medplum/fhir-router';
import type { Bundle, BundleEntry } from '@medplum/fhirtypes';
import { globalLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';

const STORE_CONCURRENCY = 4;

/**
 * Durable storage for the in-flight state of a re-entrant async batch, backed by object storage.
 *
 * Async batch processing can take minutes for large bundles, so it must survive server deploys
 * and worker crashes. The large, immutable parts of the processor's state are persisted here so
 * that a {@link import('@medplum/fhir-router').BatchProcessor} can be rehydrated and resume where
 * it left off. Object storage (rather than Redis) is used because both the preprocessed bundle and
 * the accumulated result entries can each be tens of megabytes, which would be costly to hold in
 * Redis memory.
 *
 * State is split into two kinds of objects, both keyed by the AsyncJob id:
 *
 * - `state.json` — the {@link BatchInitialState} produced by preprocessing. Written once, before
 *   any entry is processed, and never mutated.
 * - `results/<seq>.json` — result entries produced since the previous checkpoint, keyed by their
 *   index in the original bundle. Written once per checkpoint (append-only); never rewritten. This
 *   avoids the O(n^2) write amplification of rewriting a single growing results object.
 *
 * The small, mutable progress marker (the ordering position and the number of result chunks
 * written so far) is NOT stored here; it is persisted by the worker in the BullMQ job data. Given
 * `state.json` and the chunk sequence, all objects can be read back or deleted by exact key
 * without needing a list operation.
 */
export class BatchCheckpointStore {
  private readonly keyPrefix: string;

  constructor(asyncJobId: string) {
    this.keyPrefix = `system/async-batch/${asyncJobId}`;
  }

  private inputKey(): string {
    return `${this.keyPrefix}/inputBundle.json`;
  }

  private stateKey(): string {
    return `${this.keyPrefix}/state.json`;
  }

  private chunkKey(seq: number): string {
    return `${this.keyPrefix}/results/${seq}.json`;
  }

  private async writeFile(key: string, contentType: string, data: string): Promise<void> {
    const startTime = Date.now();
    await getBinaryStorage().writeFile(key, contentType, data);
    const duration = Date.now() - startTime;
    globalLogger.info('BatchCheckpointStore write', {
      keyPrefix: this.keyPrefix,
      key,
      contentType,
      size: data.length,
      durationMs: duration,
    });
  }

  private async readFile(key: string): Promise<string> {
    const startTime = Date.now();
    const stream = await getBinaryStorage().readFile(key);
    const data = await readStreamToString(stream);
    const duration = Date.now() - startTime;
    globalLogger.info('BatchCheckpointStore read', {
      keyPrefix: this.keyPrefix,
      key,
      size: data.length,
      durationMs: duration,
    });
    return data;
  }

  /**
   * Persists the raw input bundle to object storage. Called by the request handler before the job
   * is enqueued so that the (potentially large) bundle travels out-of-band from the BullMQ job data
   * (see {@link https://github.com/medplum/medplum/issues/9124}).
   * @param bundle - The raw input bundle.
   */
  async saveInputBundle(bundle: Bundle): Promise<void> {
    await this.writeFile(this.inputKey(), ContentType.JSON, JSON.stringify(bundle));
  }

  /**
   * Loads the raw input bundle so the worker can preprocess it on the first run.
   * @returns The raw input bundle.
   */
  async loadInputBundle(): Promise<Bundle> {
    return JSON.parse(await this.readFile(this.inputKey())) as Bundle;
  }

  /**
   * Persists the initial state produced by preprocessing. Written once, before processing entries.
   * @param state - The durable initial state.
   */
  async saveInitialState(state: BatchInitialState): Promise<void> {
    await this.writeFile(this.stateKey(), ContentType.JSON, JSON.stringify(state));
  }

  /**
   * Loads the previously-persisted initial state so processing can resume.
   * @returns The durable initial state.
   */
  async loadInitialState(): Promise<BatchInitialState> {
    return JSON.parse(await this.readFile(this.stateKey())) as BatchInitialState;
  }

  /**
   * Persists a checkpoint of result entries produced since the previous checkpoint. Each chunk is
   * written to its own object and never rewritten.
   * @param seq - The zero-based sequence number of this chunk.
   * @param results - Result entries produced since the last checkpoint, keyed by original bundle index.
   */
  async saveResultChunk(seq: number, results: Record<number, BundleEntry>): Promise<void> {
    await this.writeFile(this.chunkKey(seq), ContentType.JSON, JSON.stringify(results));
  }

  /**
   * Reads back all result chunks and merges them into a single map keyed by original bundle index.
   * @param chunkCount - The number of chunks written so far (chunks `0` through `chunkCount - 1`).
   * @returns All persisted result entries, keyed by original bundle index.
   */
  async loadAllResults(chunkCount: number): Promise<Record<number, BundleEntry>> {
    const all: Record<number, BundleEntry> = Object.create(null);
    const chunkSeqs = Array.from({ length: chunkCount }, (_, i) => i);
    await this.runWithConcurrency(
      chunkSeqs,
      async (seq) => {
        Object.assign(all, JSON.parse(await this.readFile(this.chunkKey(seq))) as Record<number, BundleEntry>);
      },
      { concurrency: STORE_CONCURRENCY, logMsg: 'BatchCheckpointStore loadAllResults' }
    );
    return all;
  }

  /**
   * Deletes all durable state for this batch. Best-effort: failures to delete individual objects
   * are logged but do not throw, since cleanup runs after the job has already reached a terminal
   * state and orphaned objects can be reclaimed by an object-storage lifecycle policy.
   * @param chunkCount - The number of result chunks written so far.
   */
  async cleanup(chunkCount: number): Promise<void> {
    const storage = getBinaryStorage();
    const keys = [this.inputKey(), this.stateKey()];
    for (let seq = 0; seq < chunkCount; seq++) {
      keys.push(this.chunkKey(seq));
    }
    await this.runWithConcurrency(
      keys,
      async (key) => {
        try {
          await storage.deleteFile(key);
        } catch (err) {
          globalLogger.warn('Failed to clean up async batch checkpoint object', {
            key,
            error: normalizeErrorString(err),
          });
        }
      },
      { concurrency: STORE_CONCURRENCY, logMsg: 'BatchCheckpointStore cleanup' }
    );
  }
  private async runWithConcurrency<T>(
    jobs: T[],
    callback: (job: T) => Promise<void>,
    options: RunWithConcurrencyOptions
  ): Promise<void> {
    let nextIndex = 0;
    const concurrency = options.concurrency;
    const workerCount = Math.min(jobs.length, concurrency);

    const startTime = Date.now();
    // invoke and wait for `workerCount` while loop workers to complete
    // each worker processes items off the `items` queue one at a time until the queue is empty
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < jobs.length) {
          const job = jobs[nextIndex++];
          await callback(job);
        }
      })
    );

    if (options?.logMsg) {
      globalLogger.info(options.logMsg, {
        keyPrefix: this.keyPrefix,
        jobCount: jobs.length,
        durationMs: Date.now() - startTime,
      });
    }
  }
}

interface RunWithConcurrencyOptions {
  /** Number of jobs to run in parallel. */
  concurrency: number;
  /** Optional message to log after jobs complete along with stats */
  logMsg?: string;
}
