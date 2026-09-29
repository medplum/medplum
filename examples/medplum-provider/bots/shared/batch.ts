// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Rate-limit-aware batched writes against a Medplum server.
 *
 * A Medplum server enforces a points-per-minute write budget (the self-hosted
 * default is 50,000/minute). Any migration that writes a whole chart one
 * resource at a time — including `Patient/$set-accounts` with `propagate` —
 * burns through that budget and dies with `{"code":"throttled"}`. Running it
 * async does not help: the same limiter applies inside the AsyncJob.
 *
 * What does work is what this module implements:
 *
 *   1. Send up to {@link MAX_BUNDLE_ENTRIES} entries in ONE `Bundle type=batch`
 *      HTTP call, so N resources cost one request instead of N.
 *   2. Handle BOTH shapes of 429. A batch can fail wholesale (`executeBatch`
 *      throws `Too Many Requests`) *or* come back HTTP 200 with individual
 *      entries reporting `"status": "429"` inside the response bundle. The
 *      second shape is the one that silently drops data if you only check the
 *      outer response.
 *   3. Sleep the precise reset window. Medplum puts `_msBeforeNext` in the
 *      rate-limit payload; honouring it beats guessing a backoff.
 *   4. Retry only the entries that are still unsettled — see
 *      {@link executeBatchWithRetry} for why that matters.
 *
 * Deliberately dependency-light: type-only imports, no runtime imports. That
 * keeps it usable from a bundled Medplum bot (where every runtime import has
 * to be marked external) as well as from a plain Node script.
 */
import type { MedplumClient } from '@medplum/core';
import type { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';

/**
 * Entries per `Bundle type=batch`.
 *
 * 200 balances round-trips against retry granularity: a rate-limited chunk is
 * retried as a unit, so very large chunks make a throttle expensive, while very
 * small chunks multiply HTTP calls (and therefore wall-clock time) for no gain.
 */
export const MAX_BUNDLE_ENTRIES = 200;

/** Pause between chunks, to smooth bursts rather than slam the limiter. */
export const INTER_CHUNK_DELAY_MS = 800;

/** Fallback sleep when the 429 payload carries no `_msBeforeNext`. */
export const MEDPLUM_429_BACKOFF_MS = 45_000;

/** Upper bound on a single backoff, so a bad header value cannot stall a run. */
export const MAX_429_BACKOFF_MS = 120_000;

/** How many times a chunk with rate-limited entries is re-sent before giving up. */
export const MAX_ENTRY_RETRY_ROUNDS = 4;

/** Where progress and warnings go. Defaults to `console`. */
export interface BatchLogger {
  /**
   * Record a non-fatal problem.
   * @param message - Human-readable description.
   */
  warn: (message: string) => void;
}

const defaultLogger: BatchLogger = { warn: (message: string) => console.warn(message) };

/** Outcome of {@link executeBatchWithRetry}, index-aligned to the input entries. */
export interface BatchResult {
  /**
   * Resolved resource id per input entry, or null when the entry failed or the
   * server returned neither an inline resource nor a `Location` header.
   */
  ids: (string | null)[];
  /** Final HTTP status string per input entry (e.g. `'200'`, `'429'`), or undefined. */
  statuses: (string | undefined)[];
  /** Entries that finished 2xx. Never exceeds `entries.length`. */
  wrote: number;
  /** Entries that did not finish 2xx. Never negative. */
  failed: number;
  /** True when any entry, in any round, reported a 429. */
  rateLimited: boolean;
}

/** Tuning knobs for {@link executeBatchWithRetry}. */
export interface BatchOptions {
  /** Entries per bundle. Defaults to {@link MAX_BUNDLE_ENTRIES}. */
  chunkSize?: number;
  /** Pause between chunks in ms. Defaults to {@link INTER_CHUNK_DELAY_MS}. */
  interChunkDelayMs?: number;
  /** Retry rounds for entry-level 429s. Defaults to {@link MAX_ENTRY_RETRY_ROUNDS}. */
  maxRetryRounds?: number;
  /** Prefix used in log lines, e.g. `'backfill-compartments'`. */
  label?: string;
  /** Destination for warnings. Defaults to `console`. */
  logger?: BatchLogger;
}

/**
 * Sleep for a number of milliseconds.
 * @param ms - How long to sleep.
 * @returns A promise that resolves once the delay has elapsed.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Decide whether an error (or an entry outcome) is a rate-limit signal.
 *
 * Medplum words this two ways depending on where the limiter fires: the HTTP
 * layer says `Too Many Requests`, the operation layer says `"code":"throttled"`.
 * @param value - An Error, or any value whose string form may carry the signal.
 * @returns True when the value looks like a rate-limit rejection.
 */
export function isRateLimitError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value);
  return /Too Many Requests|throttled|\b429\b/i.test(message);
}

/**
 * Read the exact reset window out of a Medplum rate-limit payload.
 *
 * The body looks like `{"_remainingPoints":0,"_msBeforeNext":57109,...}`. Waking
 * exactly on the reset boundary tends to draw a second 429, so a 5s pad is
 * added; the result is clamped to {@link MAX_429_BACKOFF_MS}.
 * @param message - Error message or serialized OperationOutcome to parse.
 * @returns Milliseconds to sleep before retrying.
 */
export function parse429BackoffMs(message: string): number {
  const match = /_msBeforeNext"?\s*:\s*(\d+)/.exec(message);
  const parsed = match ? Number(match[1]) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(MAX_429_BACKOFF_MS, parsed + 5000);
  }
  return MEDPLUM_429_BACKOFF_MS;
}

/**
 * Run a single Medplum call, sleeping out any 429 and retrying.
 *
 * Use this for one-off writes and for reads that share the same limiter.
 * Batched writes have their own, finer-grained retry in
 * {@link executeBatchWithRetry} and should not be wrapped in this.
 * @param op - The operation to run. Called once per attempt.
 * @param label - Shown in the log line when a retry happens.
 * @param options - Attempt budget and log destination.
 * @param options.attempts - Total attempts including the first. Defaults to 4.
 * @param options.logger - Destination for warnings. Defaults to `console`.
 * @returns Whatever `op` resolves to.
 */
export async function withMedplum429Retry<T>(
  op: () => Promise<T>,
  label: string,
  options: { attempts?: number; logger?: BatchLogger } = {}
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const logger = options.logger ?? defaultLogger;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === attempts) {
        throw err;
      }
      const waitMs = parse429BackoffMs(err instanceof Error ? err.message : String(err));
      logger.warn(
        `  rate limited on ${label} — sleeping ${Math.ceil(waitMs / 1000)}s (attempt ${attempt}/${attempts})`
      );
      await sleep(waitMs);
    }
  }
  throw lastError;
}

/**
 * Build a batch entry that replaces a resource in place (`PUT Type/id`).
 *
 * The resource must already carry an `id`; this is the update-by-identity form
 * used when migrating existing rows.
 * @param resource - The full resource body to write back.
 * @returns A bundle entry ready for {@link executeBatchWithRetry}.
 */
export function updateEntry(resource: Resource & { id?: string }): BundleEntry {
  if (!resource.id) {
    throw new Error(`updateEntry requires an id on ${resource.resourceType}`);
  }
  return { resource, request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` } };
}

/**
 * Build a batch entry that upserts by business identifier (conditional `PUT`).
 *
 * The server does the dedup: no match creates, one match updates in place,
 * several matches return 412. This is the shape the DrChrono and Zus importers
 * use, and the reason they are safe to re-run.
 * @param resourceType - FHIR resource type being written.
 * @param resource - The full resource body.
 * @param system - Identifier system to match on.
 * @param value - Identifier value to match on.
 * @returns A bundle entry ready for {@link executeBatchWithRetry}.
 */
export function conditionalUpdateEntry(
  resourceType: string,
  resource: Resource,
  system: string,
  value: string
): BundleEntry {
  return {
    resource,
    request: {
      method: 'PUT',
      url: `${resourceType}?identifier=${encodeURIComponent(system)}|${encodeURIComponent(value)}`,
    },
  };
}

/**
 * Pull the resource id out of one batch response entry.
 * @param entry - A response entry from the returned bundle.
 * @returns The id, or null when the server reported neither a resource nor a location.
 */
function resolveId(entry: BundleEntry | undefined): string | null {
  const inline = entry?.resource;
  if (inline?.id) {
    return inline.id;
  }
  const location = entry?.response?.location;
  if (location) {
    // `Observation/<id>` or `Observation/<id>/_history/<v>` — take the segment after the type.
    const match = /^[A-Za-z]+\/([^/]+)/.exec(location.replace(/^.*\/fhir\/R4\//, ''));
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Send batch entries to Medplum, surviving both shapes of rate limiting.
 *
 * Two bugs this deliberately avoids, both learned the expensive way:
 *
 * **Retry double-counting.** A retry re-submits the whole chunk, so Medplum
 * re-reports entries that already succeeded on the first pass as 2xx. Tallying
 * those again inflates `wrote` past the chunk size and drives `failed` negative
 * — a 20-entry chunk with 2 throttled entries once reported `38 wrote /
 * -18 failed`. So every retry pass tallies *only* entries that are still
 * unsettled.
 *
 * **Success tracking needs its own array.** `settledOk` is kept separate from
 * `ids` because a 2xx entry whose id could not be resolved leaves `ids[i]` null
 * while still being a success. Using `ids` alone to detect prior success
 * re-counts exactly those entries on the retry pass.
 * @param medplum - Authenticated client.
 * @param entries - Bundle entries, typically from {@link updateEntry} or {@link conditionalUpdateEntry}.
 * @param options - Chunk size, delays, retry budget and logging.
 * @returns Per-entry ids and statuses plus `wrote`/`failed` tallies.
 */
export async function executeBatchWithRetry(
  medplum: MedplumClient,
  entries: BundleEntry[],
  options: BatchOptions = {}
): Promise<BatchResult> {
  const chunkSize = options.chunkSize ?? MAX_BUNDLE_ENTRIES;
  const interChunkDelayMs = options.interChunkDelayMs ?? INTER_CHUNK_DELAY_MS;
  const maxRetryRounds = options.maxRetryRounds ?? MAX_ENTRY_RETRY_ROUNDS;
  const logger = options.logger ?? defaultLogger;
  const label = options.label ?? 'batch';

  const ids: (string | null)[] = new Array(entries.length).fill(null);
  const statuses: (string | undefined)[] = new Array(entries.length).fill(undefined);
  // Index-aligned "already tallied as written". NOT derivable from `ids` — see the doc comment.
  const settledOk: boolean[] = new Array(entries.length).fill(false);
  let wrote = 0;
  let failed = 0;
  let rateLimited = false;

  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const chunk = entries.slice(offset, offset + chunkSize);

    /**
     * Send one bundle for the given subset of the chunk.
     * @param subset - Chunk-relative indexes to send.
     * @returns The response bundle, index-aligned to `subset`.
     */
    const send = (subset: number[]): Promise<Bundle> =>
      medplum.executeBatch({
        resourceType: 'Bundle',
        type: 'batch',
        entry: subset.map((j) => chunk[j]),
      });

    /**
     * Tally one response bundle against the chunk.
     *
     * Only entries that are still unsettled are counted, which is what keeps a
     * retry from re-counting first-pass successes.
     * @param bundle - The response bundle.
     * @param subset - Chunk-relative indexes that produced it, in order.
     * @returns Newly written count and the first 429 payload seen, if any.
     */
    const tally = (bundle: Bundle, subset: number[]): { newlyWrote: number; backoffSource: string } => {
      let newlyWrote = 0;
      let backoffSource = '';
      for (let k = 0; k < subset.length; k++) {
        const j = subset[k];
        if (settledOk[offset + j]) {
          continue; // already counted — never tally a success twice
        }
        const responseEntry = bundle.entry?.[k];
        const status = responseEntry?.response?.status;
        statuses[offset + j] = status;
        if (status?.startsWith('2')) {
          newlyWrote++;
          settledOk[offset + j] = true;
          ids[offset + j] = resolveId(responseEntry);
        } else if (status?.startsWith('429')) {
          rateLimited = true;
          if (!backoffSource) {
            backoffSource = JSON.stringify(responseEntry?.response?.outcome ?? '');
          }
        }
      }
      return { newlyWrote, backoffSource };
    };

    let pending = chunk.map((_entry, j) => j);

    for (let round = 0; round <= maxRetryRounds; round++) {
      let bundle: Bundle;
      try {
        bundle = await send(pending);
      } catch (err) {
        // Whole-bundle 429: the limiter rejected the request before any entry ran.
        if (isRateLimitError(err) && round < maxRetryRounds) {
          rateLimited = true;
          const waitMs = parse429BackoffMs(err instanceof Error ? err.message : String(err));
          logger.warn(`[${label}] batch 429 — sleeping ${Math.ceil(waitMs / 1000)}s then retrying ${pending.length}`);
          await sleep(waitMs);
          continue;
        }
        logger.warn(`[${label}] batch threw: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }

      const { newlyWrote, backoffSource } = tally(bundle, pending);
      wrote += newlyWrote;

      // Per-entry 429: the HTTP call was 200, but individual entries were throttled.
      pending = pending.filter((j) => !settledOk[offset + j] && statuses[offset + j]?.startsWith('429'));
      if (pending.length === 0 || round === maxRetryRounds) {
        break;
      }
      const waitMs = parse429BackoffMs(backoffSource);
      logger.warn(
        `[${label}] ${pending.length}/${chunk.length} entries 429'd (round ${round + 1}/${maxRetryRounds}) — ` +
          `sleeping ${Math.ceil(waitMs / 1000)}s`
      );
      await sleep(waitMs);
    }

    for (let j = 0; j < chunk.length; j++) {
      if (settledOk[offset + j]) {
        continue;
      }
      failed++;
      const status = statuses[offset + j];
      if (status && !status.startsWith('429')) {
        logger.warn(`[${label}] entry ${offset + j} (${chunk[j].request?.url}) → ${status}`);
      }
    }

    if (interChunkDelayMs > 0 && offset + chunkSize < entries.length) {
      await sleep(interChunkDelayMs);
    }
  }

  if (failed > 0) {
    logger.warn(`[${label}] ${failed}/${entries.length} entries did not settle 2xx`);
  }
  return { ids, statuses, wrote, failed, rateLimited };
}

/** One resource to upsert by business identifier. */
export interface UpsertEntry {
  /** FHIR resource type being written. */
  resourceType: string;
  /** Full resource body. */
  resource: Resource;
  /** Identifier system to match on. */
  system: string;
  /** Identifier value to match on. */
  value: string;
}

/**
 * Upsert many resources by business identifier in as few HTTP calls as possible.
 *
 * Convenience wrapper over {@link conditionalUpdateEntry} plus
 * {@link executeBatchWithRetry}, matching the shape the importers use.
 * @param medplum - Authenticated client.
 * @param entries - Resources plus the identifier each is keyed on.
 * @param options - Chunk size, delays, retry budget and logging.
 * @returns Per-entry ids and statuses plus `wrote`/`failed` tallies.
 */
export async function upsertBatch(
  medplum: MedplumClient,
  entries: UpsertEntry[],
  options: BatchOptions = {}
): Promise<BatchResult> {
  return executeBatchWithRetry(
    medplum,
    entries.map((e) => conditionalUpdateEntry(e.resourceType, e.resource, e.system, e.value)),
    options
  );
}
