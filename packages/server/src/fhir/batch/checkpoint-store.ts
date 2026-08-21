// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { ContentType, normalizeErrorString } from '@medplum/core';
import type { BatchInitialState, BundlePreprocessInfo } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, ResourceType } from '@medplum/fhirtypes';
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
 * - `state.json` — the {@link BatchInitialState} produced by preprocessing (the preprocessed
 *   bundle, ordering, and preprocess-time results). Written once, before any entry is processed,
 *   and never mutated.
 * - `results/<seq>.json` — result entries produced since the previous checkpoint, keyed by their
 *   index in the original bundle. Written once per checkpoint (append-only); never rewritten. This
 *   avoids the O(n^2) write amplification of rewriting a single growing results object.
 * - `identities/<seq>.json` — the resolved-identity map (placeholder URN to real reference),
 *   append-only and keyed by an INDEPENDENT sequence. Chunk 0 is the preprocess-time seed (written
 *   once on the first run, even when empty, so "chunk 0 is the seed" always holds); chunks 1..n are
 *   reconciliation deltas produced when an entry resolves to an id other than the one assigned
 *   during preprocessing (a conditional create matching a concurrently-created resource, or a
 *   transaction retry). A delta chunk is written only when a checkpoint produced a non-empty delta
 *   (divergences are rare), so the sequence stays dense and empty writes are avoided. On resume the
 *   worker reads back the whole stream to reconstruct the current map.
 *
 * The small, mutable progress marker (the ordering position and the number of result and identity
 * chunks written so far) is NOT stored here; it is persisted by the worker in the BullMQ job data.
 * Given `state.json` and the chunk sequences, all objects can be read back or deleted by exact key
 * without needing a list operation.
 */
export class BatchCheckpointStore {
  private readonly keyPrefix: string;
  private readonly logger: ILogger;

  constructor(asyncJobId: string, logger: ILogger) {
    this.keyPrefix = `system/async-batch/${asyncJobId}`;
    this.logger = logger;
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

  private identityKey(seq: number): string {
    return `${this.keyPrefix}/identities/${seq}.json`;
  }

  private async writeFile(key: string, contentType: string, data: string): Promise<void> {
    const startTime = Date.now();
    await getBinaryStorage().writeFile(key, contentType, data);
    const duration = Date.now() - startTime;
    this.logger.info('BatchCheckpointStore write', {
      key,
      size: data.length,
      durationMs: duration,
    });
  }

  private async readFile(key: string): Promise<string> {
    const startTime = Date.now();
    const stream = await getBinaryStorage().readFile(key);
    const data = await readStreamToString(stream);
    const duration = Date.now() - startTime;
    this.logger.info('BatchCheckpointStore read', {
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
   * `bundleInfo.resourceTypes` is a `Set`, which `JSON.stringify` would silently drop, so it is
   * persisted as an array and revived in {@link loadInitialState}.
   * @param state - The durable initial state.
   */
  async saveInitialState(state: BatchInitialState): Promise<void> {
    const persisted: PersistedInitialState = {
      ...state,
      bundleInfo: { ...state.bundleInfo, resourceTypes: Array.from(state.bundleInfo.resourceTypes) },
    };
    await this.writeFile(this.stateKey(), ContentType.JSON, JSON.stringify(persisted));
  }

  /**
   * Loads the previously-persisted initial state so processing can resume.
   *
   * A single read also surfaces `legacyResolvedIdentities` for back-compat: jobs preprocessed
   * before the resolved-identity map moved to its own chunk stream persisted it inside `state.json`
   * and wrote no seed chunk. When present, the worker layers any newer identity delta chunks on top
   * of it. (Reading it here rather than via a second method avoids re-reading `state.json`, which
   * embeds the full bundle.)
   * @returns The durable initial state, plus any legacy resolved-identity map from an older format.
   */
  async loadInitialState(): Promise<{
    state: BatchInitialState;
    // TODO{v5.x} remove legacyResolvedIdentities once no jobs preprocessed before identity chunks remain in flight
    legacyResolvedIdentities?: Record<string, string>;
  }> {
    const persisted = JSON.parse(await this.readFile(this.stateKey())) as PersistedInitialState;
    const { resolvedIdentities, ...state } = persisted;
    return {
      state: {
        ...state,
        bundleInfo: { ...persisted.bundleInfo, resourceTypes: new Set(persisted.bundleInfo.resourceTypes) },
      },
      legacyResolvedIdentities: resolvedIdentities,
    };
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
   * Persists a chunk of the resolved-identity map (placeholder URN to real reference). Each chunk
   * is written to its own object and never rewritten. Chunk 0 is the preprocess-time seed (written
   * once on the first run); subsequent chunks are reconciliation deltas, and the worker writes one
   * only when a checkpoint produced a non-empty delta, so the sequence stays dense.
   * @param seq - The zero-based sequence number of this identity chunk (0 is the seed).
   * @param updates - The seed map (seq 0) or the identity reconciliations since the last checkpoint.
   */
  async saveIdentityChunk(seq: number, updates: Record<string, string>): Promise<void> {
    await this.writeFile(this.identityKey(seq), ContentType.JSON, JSON.stringify(updates));
  }

  /**
   * Reads back the first `chunkCount` result chunks and merges them into a single map keyed by
   * original bundle index. A caller that already holds recently-written chunks in memory may pass
   * a smaller count to read back only the chunks it is missing.
   * @param chunkCount - The number of leading chunks to read (chunks `0` through `chunkCount - 1`).
   * @returns The persisted result entries from those chunks, keyed by original bundle index.
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
   * Reads back the first `identityChunkCount` identity chunks and merges them into the current
   * resolved-identity map (placeholder URN to real reference): chunk 0 (the preprocess seed) plus
   * any reconciliation deltas. Later chunks win on key collision, so a reconciliation correctly
   * overrides the seed.
   * @param identityChunkCount - The number of leading identity chunks to read (chunks `0` through
   * `identityChunkCount - 1`).
   * @returns The resolved-identity map reconstructed from those chunks, keyed by placeholder URN.
   */
  async loadAllIdentities(identityChunkCount: number): Promise<Record<string, string>> {
    const all: Record<string, string> = Object.create(null);
    const chunkSeqs = Array.from({ length: identityChunkCount }, (_, i) => i);
    await this.runWithConcurrency(
      chunkSeqs,
      async (seq) => {
        Object.assign(all, JSON.parse(await this.readFile(this.identityKey(seq))) as Record<string, string>);
      },
      { concurrency: STORE_CONCURRENCY, logMsg: 'BatchCheckpointStore loadAllIdentities' }
    );
    return all;
  }

  /**
   * Deletes all durable state for this batch. Best-effort: failures to delete individual objects
   * are logged but do not throw, since cleanup runs after the job has already reached a terminal
   * state and orphaned objects can be reclaimed by an object-storage lifecycle policy.
   * @param chunkCount - The number of result chunks written so far.
   * @param identityChunkCount - The number of identity chunks written so far. Defaults to 0 for
   * callers (and in-flight jobs from an older deploy) that never wrote any identity chunks.
   */
  async cleanup(chunkCount: number, identityChunkCount = 0): Promise<void> {
    const storage = getBinaryStorage();
    const keys = [this.inputKey(), this.stateKey()];
    for (let seq = 0; seq < chunkCount; seq++) {
      keys.push(this.chunkKey(seq));
    }
    for (let seq = 0; seq < identityChunkCount; seq++) {
      keys.push(this.identityKey(seq));
    }
    await this.runWithConcurrency(
      keys,
      async (key) => {
        try {
          await storage.deleteFile(key);
        } catch (err) {
          this.logger.warn('BatchCheckpointStore failed to clean up object', {
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

    if (jobs.length) {
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
    }

    if (options?.logMsg) {
      this.logger.info(options.logMsg, {
        keyPrefix: this.keyPrefix,
        jobCount: jobs.length,
        durationMs: Date.now() - startTime,
      });
    }
  }
}

/** The JSON-safe on-disk form of {@link BatchInitialState}. */
interface PersistedInitialState extends Omit<BatchInitialState, 'bundleInfo'> {
  // TODO{v5.2} make resourceTypes required
  bundleInfo: Omit<BundlePreprocessInfo, 'resourceTypes'> & { resourceTypes?: ResourceType[] };
  // TODO{v5.x} remove — jobs preprocessed before the resolved-identity map moved to its own chunk
  // stream persisted it here instead; read back for back-compat by loadInitialState.
  resolvedIdentities?: Record<string, string>;
}

interface RunWithConcurrencyOptions {
  /** Number of jobs to run in parallel. */
  concurrency: number;
  /** Optional message to log after jobs complete along with stats */
  logMsg?: string;
}
