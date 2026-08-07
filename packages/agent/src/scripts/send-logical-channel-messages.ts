// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Traffic generator for the logical-channels feature (DURABLE_QUEUE_ARCHITECTURE.md §4.2),
 * partitioned on **patient ID**. Point it at a running agent's MLLP listener; it sends an
 * interleaved burst of ADT messages across N distinct patients and reports whether the agent
 * accepted every one, held per-patient FIFO order, and processed distinct patients in parallel.
 *
 * It talks to the agent over the HL7 interface and nothing else — no Medplum API calls, no
 * resource provisioning, no bot deployment. Channel configuration is a precondition:
 *
 *   Agent.setting     durableQueue = true, channelMaxWorkers = <pool size>
 *   Endpoint.address  mllp://0.0.0.0:<port>?enhanced=true&logicalChannelKey=PID-3.1
 *
 * and the channel's Bot must be slow enough that dispatch windows can overlap — with an
 * instant Bot there is no concurrency to observe. Call `Agent/$reload-config` after changing
 * any of the above so the running agent re-resolves it.
 *
 * What the two ACK legs mean, and why both are needed:
 *
 * - **Commit ACK (CA)** is sent as soon as the row is durably written, *before* dispatch. It
 *   proves the message was accepted; it says nothing about partitioning. Standard enhanced
 *   mode (`?enhanced=true`) only.
 * - **Application ACK (AA)** carries the Bot's response and is relayed when the row terminally
 *   settles. Its arrival *order* proves per-patient FIFO; its arrival *timing* is the only
 *   sender-visible evidence of cross-patient concurrency. Suppressed under `?enhanced=aa`.
 *
 * Usage:
 *   npm run send-logical-channels -- --port 57000 [--patients 4] [--per-patient 3]
 */

import { Hl7Message, normalizeErrorString, sleep } from '@medplum/core';
import type { Hl7Connection } from '@medplum/hl7';
import { Hl7Client } from '@medplum/hl7';
import { randomUUID } from 'node:crypto';

/** The `logicalChannelKey` spec this script's messages are built for. */
const KEY_SPEC = 'PID-3.1';

/** Commit-level ACK codes: the agent's answer to "did the durable write succeed?". */
const COMMIT_ACCEPT = 'CA';
const COMMIT_NACKS = ['CE', 'CR'];

/**
 * The application-level accept: the Bot's answer, relayed at terminal settle. Any other
 * non-commit code (`AE`, `AR`, or something unexpected) is treated as a settling failure, so
 * only the accepting code needs naming.
 */
const APP_ACCEPT = 'AA';

/**
 * Floor on the estimated per-message service time below which the parallelism estimate is
 * meaningless — dividing a burst's wall clock by a near-zero service time yields noise, not a
 * concurrency factor. A Bot fast enough to land here cannot demonstrate partitioning at all.
 */
const MIN_SERVICE_MS = 25;

interface Options {
  host: string;
  port: number;
  patients: number;
  perPatient: number;
  patientPrefix: string;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  connections: number;
  expectParallelism: number;
  /** The channel's `channelMaxWorkers`, if known — the other half of the parallelism ceiling. */
  maxWorkers?: number;
  maxUncommitted: number;
  /** Control-ID prefix tag. Pin it to scope a downstream receiver before the burst starts. */
  runId?: string;
  json: boolean;
  quiet: boolean;
}

const DEFAULTS: Omit<Options, 'port'> = {
  host: '127.0.0.1',
  patients: 4,
  perPatient: 3,
  patientPrefix: 'MRN',
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 120_000,
  connections: 1,
  expectParallelism: 2,
  maxUncommitted: 20_000,
  json: false,
  quiet: false,
};

const USAGE = `Send an interleaved, patient-partitioned HL7 burst at an agent's MLLP listener.

  --port <port>             agent MLLP port (required)
  --host <host>             agent MLLP host (default ${DEFAULTS.host})
  --patients <n>            distinct patient IDs, i.e. logical channels (default ${DEFAULTS.patients})
  --per-patient <n>         messages per patient (default ${DEFAULTS.perPatient})
  --patient-prefix <s>      MRN prefix (default ${DEFAULTS.patientPrefix})
  --connections <n>         concurrent MLLP connections (default ${DEFAULTS.connections})
  --max-retries <n>         retransmits per message before giving up (default ${DEFAULTS.maxRetries})
  --retry-delay <ms>        wait before a retransmit (default ${DEFAULTS.retryDelayMs})
  --timeout <ms>            quiet period with no settles before stragglers are retransmitted
                            (default ${DEFAULTS.timeoutMs})
  --expect-parallelism <n>  minimum acceptable parallelism estimate (default ${DEFAULTS.expectParallelism})
  --max-workers <n>         the channel's channelMaxWorkers. Supply it to bound the parallelism
                            estimate: the true ceiling is min(patients, maxWorkers), and without
                            this only the patient count is known, so an impossible estimate on a
                            small pool reads as a pass
  --run-id <s>              tag control IDs with this instead of a random one, so a downstream
                            receiver can be scoped to this run before the burst starts
  --max-uncommitted <n>     pause the flood while this many messages are awaiting a commit ACK
                            (default ${DEFAULTS.maxUncommitted}); bounds the socket buffer without
                            starving the dispatch queue. 0 disables the gate
  --json                    also emit the raw per-message records as JSON
  --quiet                   suppress the per-message timeline; at high message counts its writes
                            compete with the burst being measured
  --help

The endpoint must be configured with ?enhanced=true&logicalChannelKey=${KEY_SPEC}.`;

/** One message's full lifecycle, from generation through however many transmit attempts it took. */
interface MessageRecord {
  /** Position in the interleaved send order, 0-based. */
  index: number;
  patient: string;
  /** 1-based position within this patient's own sequence — the order FIFO is checked against. */
  seq: number;
  controlId: string;
  connectionIndex: number;
  sentAt?: number;
  /** Time of the most recent commit ACK; absent means the channel isn't in standard enhanced mode. */
  commitAckAt?: number;
  /** Time the settling (application-level) ACK arrived. */
  settleAckAt?: number;
  /**
   * Socket arrival rank of the settling ACK. Ordering uses this rather than `settleAckAt`
   * because two settles in the same millisecond would tie, and a tie is indistinguishable from
   * an out-of-order delivery — exactly the thing being asserted.
   */
  settleRank?: number;
  settleCode?: string;
  attempts: number;
  /** True between a write and its commit-level answer; drives the CA credit gate. */
  awaitingCommit?: boolean;
  /** NACK codes and transport errors seen across all attempts, in order. */
  failures: string[];
}

/**
 * Builds an `ADT^A01` carrying `patient` in PID-3.1, so a channel keyed on `PID-3.1` assigns it
 * to partition `PID-3.1:<patient>`. Sending facility is held constant across the burst so the
 * patient ID is the only thing that can partition the traffic.
 * @param patient - The patient ID (MRN) to place in PID-3.1.
 * @param controlId - MSH-10, unique per message; a retransmit reuses it.
 * @param seq - This message's 1-based position within the patient's sequence.
 * @returns The parsed message, ready to send.
 */
function buildMessage(patient: string, controlId: string, seq: number): Hl7Message {
  const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return Hl7Message.parse(
    `MSH|^~\\&|LCTEST|LCFAC|MEDPLUM|MEDPLUM|${now}||ADT^A01|${controlId}|P|2.5\r` +
      `EVN|A01|${now}\r` +
      `PID|1||${patient}^^^LCFAC^MR||DEMO^PATIENT^${seq}||19700101|M\r`
  );
}

/**
 * Parses `--flag value` style arguments.
 * @param argv - Raw `process.argv`.
 * @returns The resolved options, or undefined if usage was requested or the input was invalid.
 */
function parseArgs(argv: string[]): Options | undefined {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return undefined;
  }

  const partial: Partial<Options> = { ...DEFAULTS };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const next = (): string => {
      const value = args[++i];
      if (value === undefined) {
        throw new Error(`Missing value for ${flag}`);
      }
      return value;
    };
    switch (flag) {
      case '--host':
        partial.host = next();
        break;
      case '--port':
        partial.port = positiveInt(flag, next());
        break;
      case '--patients':
        partial.patients = positiveInt(flag, next());
        break;
      case '--per-patient':
        partial.perPatient = positiveInt(flag, next());
        break;
      case '--patient-prefix':
        partial.patientPrefix = next();
        break;
      case '--connections':
        partial.connections = positiveInt(flag, next());
        break;
      case '--max-retries':
        partial.maxRetries = positiveInt(flag, next(), 0);
        break;
      case '--retry-delay':
        partial.retryDelayMs = positiveInt(flag, next(), 0);
        break;
      case '--timeout':
        partial.timeoutMs = positiveInt(flag, next());
        break;
      case '--expect-parallelism':
        partial.expectParallelism = Number.parseFloat(next());
        break;
      case '--max-workers':
        partial.maxWorkers = positiveInt(flag, next());
        break;
      case '--max-uncommitted':
        partial.maxUncommitted = positiveInt(flag, next(), 0);
        break;
      case '--run-id':
        partial.runId = next();
        break;
      case '--json':
        partial.json = true;
        break;
      case '--quiet':
        partial.quiet = true;
        break;
      default:
        throw new Error(`Unknown argument '${flag}'\n\n${USAGE}`);
    }
  }

  if (partial.port === undefined) {
    throw new Error(`Missing required argument --port\n\n${USAGE}`);
  }
  return partial as Options;
}

/**
 * Parses an integer argument.
 * @param flag - The flag the value belongs to, for the error message.
 * @param value - The raw value.
 * @param min - Smallest accepted value.
 * @returns The parsed integer.
 */
function positiveInt(flag: string, value: string, min = 1): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${flag} must be an integer >= ${min}, got '${value}'`);
  }
  return parsed;
}

/**
 * @param message - The ACK to read.
 * @returns The uppercased MSA-1 ACK code, or undefined if the message carries no MSA segment.
 */
function ackCode(message: Hl7Message): string | undefined {
  return message.getSegment('MSA')?.getField(1)?.toString()?.toUpperCase() || undefined;
}

/**
 * Records the arrival of every inbound ACK on a connection.
 *
 * Both legs land here: `Hl7Connection` dispatches `'message'` for each ACK before matching it
 * to a pending send, so the CA is observable even though `sendAndWait` is configured to resolve
 * on the application ACK.
 * @param connection - The connection to observe.
 * @param byControlId - Records keyed by MSH-10, correlated via the ACK's MSA-2.
 * @param state - Counters shared across connections so ranks stay comparable.
 */
function observeAcks(connection: Hl7Connection, byControlId: Map<string, MessageRecord>, state: FloodState): void {
  connection.addEventListener('message', (event) => {
    const code = ackCode(event.message);
    const controlId = event.message.getSegment('MSA')?.getField(2)?.toString();
    if (!code || !controlId) {
      return;
    }
    const record = byControlId.get(controlId);
    if (!record) {
      return;
    }
    if (code === COMMIT_ACCEPT || COMMIT_NACKS.includes(code)) {
      // Any commit-level answer returns the message's credit, NACKs included — the commit leg is
      // finished either way, and withholding credit for a rejected message would slowly throttle
      // the flood to a halt.
      if (record.awaitingCommit) {
        record.awaitingCommit = false;
        state.uncommitted--;
      }
      state.commits++;
    }
    if (code === COMMIT_ACCEPT) {
      // Overwritten rather than kept-first so it pairs with the attempt that actually settled,
      // which is what the service-time estimate below subtracts from.
      record.commitAckAt = Date.now();
    } else if (!COMMIT_NACKS.includes(code)) {
      // Count an acceptance only on the first one, so a duplicate ACK for a retransmit can't
      // push the tally past the message count and end the wait early.
      if (code === APP_ACCEPT && record.settleCode !== APP_ACCEPT) {
        state.accepted++;
      }
      record.settleCode = code;
      record.settleAckAt = Date.now();
      record.settleRank = ++state.arrivals;
    }
  });
}

/** Shared counters the ACK observer updates and the flood reads. */
interface FloodState {
  /** Settling ACKs seen so far; also the arrival rank counter. */
  arrivals: number;
  /** Messages that have settled `AA`. */
  accepted: number;
  /** Messages written but not yet answered at the commit leg — the credit gate's meter. */
  uncommitted: number;
  /** Commit-level answers seen; used to tell "gate is working" from "no CAs are coming". */
  commits: number;
}

/** Messages written between event-loop yields, so inbound ACKs and socket drain get a turn. */
const WRITE_CHUNK = 500;

/** How often the commit-credit gate re-checks while the flood is paused. */
const CREDIT_POLL_MS = 5;

/** How often the settle-wait loop wakes to check progress. */
const POLL_MS = 1000;

/** How often the settle-wait loop reports progress, in poll ticks. */
const PROGRESS_EVERY = 10;

/**
 * Floods the channel: writes every message as fast as the socket accepts it, then waits for the
 * ACKs to come back.
 *
 * Sending is deliberately decoupled from settling. Waiting on each message's application ACK
 * before sending the next couples the send rate to the agent's *processing* rate, which starves
 * the queue — the agent never accumulates a backlog, so there is nothing for the worker pool to
 * partition and the test measures round-trip latency instead of throughput. Writing everything up
 * front lets the agent commit at full speed and build the deep, many-partition backlog the feature
 * is meant to chew through. Backpressure is still real, just further down: the agent stops reading
 * when it is saturated, TCP fills, and `send` blocks in the kernel buffer.
 *
 * Nothing is awaited per message, so there is no promise, timer, or pending-map entry per message
 * either — only the record survives the write, which is what lets the total count scale into the
 * millions. Settles are correlated asynchronously by {@link observeAcks}.
 *
 * Send order matches record order: writes are synchronous and sequential, so a lower index can
 * never be overtaken. That is what the per-partition FIFO assertion rests on.
 * @param records - Every message's record, in send order.
 * @param connections - The open connections, indexed by `record.connectionIndex`.
 * @param options - Resolved CLI options.
 * @param state - Shared ACK-observer state, used here to track settle progress.
 * @param state.arrivals - Settling ACKs seen so far.
 * @param state.accepted - Messages that have settled `AA`.
 */
async function floodBurst(
  records: MessageRecord[],
  connections: Hl7Connection[],
  options: Options,
  state: FloodState
): Promise<void> {
  const writeStartedAt = Date.now();
  let gating = options.maxUncommitted > 0;
  for (let i = 0; i < records.length; i++) {
    if (gating && state.uncommitted >= options.maxUncommitted) {
      gating = await awaitCommitCredit(options, state);
    }
    write(records[i], connections, state);
    if ((i + 1) % WRITE_CHUNK === 0) {
      await sleep(0);
      if ((i + 1) % (WRITE_CHUNK * 20) === 0) {
        console.log(
          `  ... wrote ${i + 1}/${records.length}, uncommitted ${state.uncommitted}, settled ${state.accepted}`
        );
      }
    }
  }
  console.log(`  flood complete: ${records.length} written in ${Date.now() - writeStartedAt} ms; waiting for settles`);

  // Retransmit only when the WHOLE run goes quiet for `timeoutMs`. Per-message deadlines are wrong
  // here: every message was sent at once, so a message deep in the queue is legitimately unanswered
  // for a long time and would be resent while still perfectly healthy.
  let lastAccepted = -1;
  let lastProgressAt = Date.now();
  let ticks = 0;
  while (state.accepted < records.length) {
    await sleep(POLL_MS);
    if (state.accepted !== lastAccepted) {
      lastAccepted = state.accepted;
      lastProgressAt = Date.now();
      if (++ticks % PROGRESS_EVERY === 0) {
        console.log(`  ... settled ${state.accepted}/${records.length}`);
      }
      continue;
    }
    if (Date.now() - lastProgressAt < options.timeoutMs) {
      continue;
    }
    const stragglers = records.filter((r) => r.settleCode !== APP_ACCEPT && r.attempts <= options.maxRetries);
    if (stragglers.length === 0) {
      console.log(`  no progress for ${options.timeoutMs} ms and no retryable messages left; giving up`);
      return;
    }
    console.log(`  no progress for ${options.timeoutMs} ms; retransmitting ${stragglers.length} message(s)`);
    for (const record of stragglers) {
      record.failures.push(record.settleCode ?? 'no settling ACK');
      // Same MSH-10 as the original, which is what a real sending system does — and which
      // additionally exercises the agent's duplicate handling (idempotent replay of the stored
      // ACK, or `CR` under `duplicateBehavior=reject`).
      write(record, connections, state);
    }
    lastProgressAt = Date.now();
  }
}

/**
 * Writes one message and books a commit credit against it.
 *
 * Owns the attempt counter, so a first write lands on 1 and each retransmit bumps it. The
 * ordering and parallelism claims are made over `attempts === 1` messages, so leaving it at 0
 * would silently empty that population and skip both checks rather than fail them.
 * @param record - The record being sent; stamped with the send time and marked awaiting-commit.
 * @param connections - The open connections, indexed by `record.connectionIndex`.
 * @param state - Shared counters; `uncommitted` is incremented here and returned by the observer.
 */
function write(record: MessageRecord, connections: Hl7Connection[], state: FloodState): void {
  record.attempts++;
  record.sentAt = Date.now();
  record.awaitingCommit = true;
  state.uncommitted++;
  connections[record.connectionIndex].send(buildMessage(record.patient, record.controlId, record.seq));
}

/**
 * Blocks the flood until commit credit frees up.
 *
 * Gating on the COMMIT ack, not the settle, is the whole point: a CA is sent the moment the row is
 * durably written — long before dispatch — so the agent can keep committing at full speed and the
 * dispatch backlog still forms. Gating on the settling ACK instead would tie the send rate to the
 * agent's processing rate and starve the queue, which is exactly the failure this replaced.
 *
 * Gives up on the gate rather than deadlocking: a channel that never sends a CA (not in standard
 * enhanced mode) would otherwise hold here forever once the first `maxUncommitted` messages are
 * out, so a stall with no commit progress downgrades to an ungated flood and says so.
 * @param options - Resolved CLI options.
 * @param state - Shared counters.
 * @returns True to keep gating, false once the gate has been abandoned.
 */
async function awaitCommitCredit(options: Options, state: FloodState): Promise<boolean> {
  let seen = state.commits;
  let since = Date.now();
  while (state.uncommitted >= options.maxUncommitted) {
    await sleep(CREDIT_POLL_MS);
    if (state.commits !== seen) {
      seen = state.commits;
      since = Date.now();
      continue;
    }
    if (Date.now() - since >= options.timeoutMs) {
      console.log(
        state.commits === 0
          ? `  no commit ACKs after ${options.timeoutMs} ms — channel is not in standard enhanced mode; flooding ungated`
          : `  commit ACKs stalled for ${options.timeoutMs} ms — flooding ungated from here`
      );
      return false;
    }
  }
  return true;
}

interface Analysis {
  /** True when commit ACKs were seen, i.e. the channel is in standard enhanced mode. */
  enhanced: boolean;
  committed: number;
  settled: number;
  accepted: number;
  retransmits: number;
  /** Messages excluded from the ordering and parallelism claims because they were retransmitted. */
  excluded: number;
  /** Patients with enough first-attempt settles for the ordering claim to mean anything. */
  patientsChecked: number;
  fifoViolations: string[];
  wallClockMs: number;
  serviceEstimateMs?: number;
  parallelism?: number;
  /** Set when the parallelism estimate exceeded its own ceiling and cannot be trusted. */
  parallelismUnreliable: boolean;
}

/**
 * Derives the verdicts from the recorded timeline.
 *
 * Both the ordering and parallelism claims are made over messages that were **accepted on their
 * first attempt**. A retransmitted message re-enters the agent's queue long after its siblings —
 * so it settles late by construction, which would show up as a bogus ordering violation and
 * would stretch the elapsed span enough to deflate the parallelism estimate. Neither is a fact
 * about the agent; both are artifacts of this script having resent the message. Exclusions are
 * counted and reported so they are never silent.
 * @param records - Every message's record, in send order.
 * @param startedAt - Burst start time.
 * @param wallClockMs - Elapsed time from the first send to the last settle, retransmits included.
 * @param patientCount - Number of distinct patients, one half of the parallelism ceiling.
 * @param maxWorkers - The channel's pool size if known, the other half of that ceiling.
 * @returns The computed analysis.
 */
function analyze(
  records: MessageRecord[],
  startedAt: number,
  wallClockMs: number,
  patientCount: number,
  maxWorkers: number | undefined
): Analysis {
  const committed = records.filter((r) => r.commitAckAt !== undefined).length;
  const settled = records.filter((r) => r.settleRank !== undefined).length;
  const accepted = records.filter((r) => r.settleCode === APP_ACCEPT).length;
  const retransmits = records.reduce((sum, r) => sum + (r.attempts - 1), 0);

  const clean = records.filter((r) => r.attempts === 1 && r.settleRank !== undefined);

  // Per-patient FIFO: within a partition, settles must arrive in the order the messages were
  // sent. Compared on socket arrival rank, so a shared millisecond can't mask a reordering.
  const fifoViolations: string[] = [];
  let patientsChecked = 0;
  for (const patient of new Set(records.map((r) => r.patient))) {
    const ranked = clean
      .filter((r) => r.patient === patient)
      .sort((a, b) => (a.settleRank as number) - (b.settleRank as number));
    if (ranked.length < 2) {
      continue;
    }
    patientsChecked++;
    const observed = ranked.map((r) => r.seq);
    const expected = [...observed].sort((a, b) => a - b);
    if (observed.join(',') !== expected.join(',')) {
      fifoViolations.push(`${patient}: settled ${observed.join(',')}, sent ${expected.join(',')}`);
    }
  }

  // Service time is the shortest observed commit-to-settle gap — a message that dispatched
  // without waiting behind a partition-mate. Extrapolating it across the burst gives the
  // strictly-serial baseline, and the ratio to the elapsed span estimates how many partitions
  // were in flight at once. It is an estimate, not a count: a sender cannot see dispatch starts.
  const gaps = clean.map((r) => (r.settleAckAt as number) - (r.commitAckAt ?? (r.sentAt as number)));
  const serviceEstimateMs = gaps.length ? Math.min(...gaps) : undefined;
  const spanMs = clean.length ? Math.max(...clean.map((r) => r.settleAckAt as number)) - startedAt : 0;
  const parallelism =
    serviceEstimateMs !== undefined && serviceEstimateMs >= MIN_SERVICE_MS && spanMs > 0
      ? (clean.length * serviceEstimateMs) / spanMs
      : undefined;

  // Nothing can dispatch more at once than it has partitions or workers, so an estimate above
  // that ceiling is self-refuting and must not be reported as a result. Two ways to get one:
  // a cold start, where the service estimate absorbs a one-off latency shared by the whole
  // burst; or a flood deep enough that even the fastest message queued, so the minimum
  // commit-to-settle gap measures backlog rather than service time. Either inflates the serial
  // baseline, and left unchecked reads as a PASS on a channel dispatching serially.
  const ceiling = maxWorkers === undefined ? patientCount : Math.min(patientCount, maxWorkers);
  const parallelismUnreliable = parallelism !== undefined && parallelism > ceiling * 1.15;

  return {
    enhanced: committed > 0,
    committed,
    settled,
    accepted,
    retransmits,
    excluded: records.length - clean.length,
    patientsChecked,
    fifoViolations,
    wallClockMs,
    serviceEstimateMs,
    parallelism,
    parallelismUnreliable,
  };
}

/**
 * Prints the per-message timeline.
 * @param records - Every message's record, in send order.
 * @param startedAt - Burst start time, used as the timeline origin.
 */
function printTimeline(records: MessageRecord[], startedAt: number): void {
  const rel = (at: number | undefined): string => (at === undefined ? '-' : String(at - startedAt));
  console.log('');
  console.log('  #  patient   seq  control id       CA(ms)  settle(ms)  code  tries  failures');
  for (const r of records) {
    console.log(
      [
        String(r.index + 1).padStart(3),
        r.patient.padEnd(9),
        String(r.seq).padStart(3),
        r.controlId.padEnd(16),
        rel(r.commitAckAt).padStart(6),
        rel(r.settleAckAt).padStart(10),
        (r.settleCode ?? '-').padEnd(4),
        String(r.attempts).padStart(5),
        r.failures.join('; '),
      ].join('  ')
    );
  }
}

/**
 * Prints the summary and returns whether the run passed.
 * @param records - Every message's record, in send order.
 * @param analysis - The computed analysis.
 * @param options - Resolved CLI options.
 * @returns True if every check passed.
 */
function report(records: MessageRecord[], analysis: Analysis, options: Options): boolean {
  const total = records.length;
  const checks: [boolean, string][] = [];

  console.log('');
  if (analysis.enhanced) {
    checks.push([analysis.committed === total, `commit ACKs        ${analysis.committed}/${total}`]);
  } else {
    console.log('  commit ACKs        none observed — channel is not in standard enhanced mode');
    console.log('                     (set ?enhanced=true on the Endpoint; under ?enhanced=aa the');
    console.log('                     application ACK is suppressed and cannot be measured)');
  }
  checks.push([analysis.settled === total, `settling ACKs      ${analysis.settled}/${total}`]);
  checks.push([analysis.accepted === total, `accepted (AA)      ${analysis.accepted}/${total}`]);
  if (analysis.patientsChecked === 0) {
    console.log('  ----  per-patient FIFO   indeterminate: no patient had 2+ first-attempt settles to order');
  } else {
    checks.push([
      analysis.fifoViolations.length === 0,
      `per-patient FIFO   ${
        analysis.fifoViolations.length === 0
          ? `in order across ${analysis.patientsChecked} patient(s)`
          : analysis.fifoViolations.join(' | ')
      }`,
    ]);
  }

  for (const [ok, line] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${line}`);
  }

  console.log('');
  console.log(`  retransmits        ${analysis.retransmits}`);
  if (analysis.excluded > 0) {
    console.log(
      `  excluded           ${analysis.excluded}/${total} from the ordering and parallelism claims (retransmitted or never settled)`
    );
  }
  console.log(`  wall clock         ${analysis.wallClockMs} ms`);
  if (analysis.serviceEstimateMs === undefined) {
    console.log('  service time       unknown (needs both a commit and a settling ACK)');
  } else {
    console.log(`  service time       ~${analysis.serviceEstimateMs} ms (min commit-to-settle)`);
  }

  let parallelismOk = true;
  if (analysis.parallelism === undefined) {
    console.log(
      `  parallelism        not estimated (service time under ${MIN_SERVICE_MS} ms — a Bot this fast leaves no dispatch window to overlap)`
    );
  } else if (analysis.parallelismUnreliable) {
    parallelismOk = false;
    console.log(
      `  FAIL  parallelism        ~${analysis.parallelism.toFixed(1)}x exceeds the ceiling of ${ceilingLabel(options)}, so the`
    );
    console.log("                     service-time estimate is not one message's cost: either a cold start");
    console.log('                     shared by the whole burst, or a backlog deep enough that even the');
    console.log('                     fastest message queued. Re-run warm, or with fewer messages.');
    if (options.maxWorkers === undefined) {
      console.log('                     (pass --max-workers to bound this by the pool size too)');
    }
  } else {
    parallelismOk = analysis.parallelism >= options.expectParallelism;
    console.log(
      `  ${parallelismOk ? 'PASS' : 'FAIL'}  parallelism        ~${analysis.parallelism.toFixed(1)}x (want >= ${options.expectParallelism}x, ceiling is ${ceilingLabel(options)})`
    );
  }

  return checks.every(([ok]) => ok) && parallelismOk;
}

/**
 * @param options - Resolved CLI options.
 * @returns How the parallelism ceiling is described in the summary — the pool size bounds it
 * only when the caller supplied it, since the sender cannot read the channel's config.
 */
function ceilingLabel(options: Options): string {
  return options.maxWorkers === undefined
    ? `${options.patients} patients (pass --max-workers to bound by pool size too)`
    : `${Math.min(options.patients, options.maxWorkers)} = min(${options.patients} patients, ${options.maxWorkers} workers)`;
}

/**
 * Runs the burst.
 * @param argv - Raw `process.argv`.
 */
export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (!options) {
    return;
  }

  const runId = options.runId ?? randomUUID().slice(0, 4);
  const patients = Array.from(
    { length: options.patients },
    (_unused, i) => `${options.patientPrefix}-${String(i + 1).padStart(3, '0')}`
  );

  // Round-robin so arrival order interleaves partitions (A1, B1, C1, A2, B2, C2, ...). A
  // patient-major order would let a single serial worker produce a passing FIFO result by
  // accident; interleaving makes per-partition ordering a real claim.
  const records: MessageRecord[] = [];
  for (let seq = 1; seq <= options.perPatient; seq++) {
    for (let p = 0; p < patients.length; p++) {
      const patient = patients[p];
      const controlId = `LC-${runId}-${p + 1}-${seq}`;
      records.push({
        index: records.length,
        patient,
        seq,
        controlId,
        connectionIndex: records.length % options.connections,
        attempts: 0,
        failures: [],
      });
    }
  }

  const byControlId = new Map(records.map((r) => [r.controlId, r]));
  const arrivalState: FloodState = { arrivals: 0, accepted: 0, uncommitted: 0, commits: 0 };

  console.log(`Sending ${records.length} messages to ${options.host}:${options.port}`);
  console.log(`  ${patients.length} patients x ${options.perPatient} messages, round-robin`);
  console.log(`  partition key      ${KEY_SPEC} (Endpoint needs ?logicalChannelKey=${KEY_SPEC}&enhanced=true)`);
  const shown = patients
    .slice(0, 4)
    .map((p) => `${KEY_SPEC}:${p}`)
    .join(', ');
  console.log(`  partitions         ${shown}${patients.length > 4 ? `, ... (${patients.length} total)` : ''}`);
  console.log(`  connections        ${options.connections}`);
  console.log(`  run id             LC-${runId} (scope a receiver with --run-id LC-${runId})`);

  const clients: Hl7Client[] = [];
  const connections: Hl7Connection[] = [];
  const transportErrors: string[] = [];
  try {
    for (let i = 0; i < options.connections; i++) {
      const client = new Hl7Client({ host: options.host, port: options.port, keepAlive: true });
      clients.push(client);
      const connection = await client.connect();
      connection.addEventListener('error', (event) => transportErrors.push(normalizeErrorString(event.error)));
      observeAcks(connection, byControlId, arrivalState);
      connections.push(connection);
    }

    const startedAt = Date.now();
    await floodBurst(records, connections, options, arrivalState);
    const wallClockMs = Date.now() - startedAt;

    if (!options.quiet) {
      printTimeline(records, startedAt);
    }
    const analysis = analyze(records, startedAt, wallClockMs, patients.length, options.maxWorkers);
    const passed = report(records, analysis, options);

    if (transportErrors.length) {
      console.log('');
      console.log(`  connection errors  ${transportErrors.join('; ')}`);
    }
    if (options.json) {
      console.log('');
      console.log(JSON.stringify({ options, analysis, records }, undefined, 2));
    }
    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    for (const client of clients) {
      await client.close();
    }
  }
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error(normalizeErrorString(err));
    process.exit(1);
  });
}
