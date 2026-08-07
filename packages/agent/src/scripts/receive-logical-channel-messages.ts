// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Downstream MLLP listener that verifies per-logical-key ordering of messages the agent pushes
 * out (`Agent/$push` / `MedplumClient.pushToAgent`), typically driven by the Bot that handled
 * the inbound leg. It is the far end of the round trip the sender script starts:
 *
 *   sender -> agent (inbound channel) -> Bot -> $push -> agent (outbound) -> this listener
 *
 * Keys are computed with the agent's own {@link computeLogicalChannelKey}, so messages are
 * grouped here exactly as the inbound channel partitions them — a divergence between the two
 * would otherwise look like an ordering bug.
 *
 * Ordering needs ground truth, which arrival order alone cannot supply, so each message must
 * carry an ordinal in a field named by `--sequence` (default `MSH-13`, the HL7 sequence number
 * and what the channel's `assignSeqNo` stamps). The assertion is that **within a logical key,
 * ordinals arrive strictly increasing** — a global ordinal works as well as a per-key one, since
 * only relative order within a key is checked. Messages sent by the companion sender script
 * carry a usable per-patient ordinal in `PID-5.3`.
 *
 * Usage:
 *   npm run receive-logical-channels -- --port 9100 [--key PID-3.1] [--sequence MSH-13]
 */

import type { Hl7Message, ILogger } from '@medplum/core';
import { LogLevel, normalizeErrorString, sleep } from '@medplum/core';
import type { Hl7Connection } from '@medplum/hl7';
import { Hl7Server } from '@medplum/hl7';
import type { LogicalChannelField } from '../logical-channel';
import { computeLogicalChannelKey, extractFieldValue, parseLogicalChannelKeySpec } from '../logical-channel';

interface Options {
  port: number;
  runId?: string;
  key: string;
  sequence: string;
  expect?: number;
  delayMs: number;
  quiet: boolean;
}

const DEFAULTS: Omit<Options, 'port'> = {
  key: 'PID-3.1',
  sequence: 'MSH-13',
  delayMs: 0,
  quiet: false,
};

const USAGE = `Receive agent-pushed HL7 messages and verify per-logical-key ordering.

  --port <port>       port to listen on (required)
  --key <spec>        logical key spec, agent notation (default ${DEFAULTS.key})
  --sequence <field>  field holding the ordinal (default ${DEFAULTS.sequence}; use PID-5.3 for
                      messages from the companion sender script)
  --run-id <substr>   only count messages whose control ID contains this; everything else is
                      ignored. Use it whenever another sender's traffic may overlap — a previous
                      run still draining out of the agent reuses the same keys and ordinals, and
                      conflating the two reports ordering violations that did not happen
  --expect <n>        distinct messages this run should deliver; the summary fails if the count
                      falls short. Always runs until Ctrl-C
  --delay <ms>        wait before ACKing, to simulate a slow downstream (default ${DEFAULTS.delayMs})
  --quiet             suppress the per-message lines, print only the summary
  --help`;

interface Arrival {
  /** 1-based arrival rank across every key. */
  arrival: number;
  key: string;
  /** The parsed ordinal, or undefined when the sequence field was absent or non-numeric. */
  seq?: number;
  controlId: string;
  at: number;
}

/** A message that arrived after one with a higher ordinal in the same logical key. */
interface Violation {
  key: string;
  previous: number;
  received: number;
  controlId: string;
}

/**
 * Parses `--flag value` style arguments.
 * @param argv - Raw `process.argv`.
 * @returns The resolved options, or undefined if usage was requested.
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
      case '--port':
        partial.port = intArg(flag, next());
        break;
      case '--key':
        partial.key = next();
        break;
      case '--sequence':
        partial.sequence = next();
        break;
      case '--run-id':
        partial.runId = next();
        break;
      case '--expect':
        partial.expect = intArg(flag, next());
        break;
      case '--delay':
        partial.delayMs = intArg(flag, next(), 0);
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
function intArg(flag: string, value: string, min = 1): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${flag} must be an integer >= ${min}, got '${value}'`);
  }
  return parsed;
}

/**
 * Minimal logger so the spec parser can report a bad spec through the same path the agent uses.
 * @returns A console-backed logger.
 */
function consoleLogger(): ILogger {
  return {
    level: LogLevel.INFO,
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
    debug: () => undefined,
    log: () => undefined,
    clone: () => consoleLogger(),
  } as unknown as ILogger;
}

/**
 * Parses a spec that must address exactly one field.
 * @param raw - The raw spec string.
 * @param label - Flag name, for the error message.
 * @param logger - Logger passed to the spec parser.
 * @returns The single parsed field.
 */
function parseSingleField(raw: string, label: string, logger: ILogger): LogicalChannelField {
  const parsed = parseLogicalChannelKeySpec(raw, logger);
  if (parsed?.length !== 1) {
    throw new Error(`${label} must name exactly one field in SEGMENT-field[.component] notation, got '${raw}'`);
  }
  return parsed[0];
}

/** Accumulated state, kept together so the summary can be printed from a signal handler. */
interface State {
  /** Wall-clock time of the first arrival, the origin for relative timestamps. */
  firstAt?: number;
  arrivals: Arrival[];
  violations: Violation[];
  duplicates: string[];
  /** Highest ordinal seen so far per logical key — what each new message is compared against. */
  highest: Map<string, number>;
  seenControlIds: Set<string>;
  missingSeq: number;
  /** Messages skipped because their control ID did not match `--run-id`. */
  ignored: number;
}

/**
 * Records one message and checks it against its key's ordering so far.
 * @param message - The received message.
 * @param keySpec - Parsed logical key spec.
 * @param seqField - Parsed sequence field.
 * @param state - Mutable accumulated state.
 * @returns The arrival record.
 */
function record(
  message: Hl7Message,
  keySpec: LogicalChannelField[],
  seqField: LogicalChannelField,
  state: State
): Arrival {
  const key = computeLogicalChannelKey(message, keySpec);
  const rawSeq = extractFieldValue(message, seqField);
  const parsedSeq = Number.parseInt(rawSeq, 10);
  const seq = Number.isInteger(parsedSeq) ? parsedSeq : undefined;
  const controlId = message.getSegment('MSH')?.getField(10)?.toString() ?? '';

  const at = Date.now();
  state.firstAt ??= at;
  const arrival: Arrival = { arrival: state.arrivals.length + 1, key, seq, controlId, at };
  state.arrivals.push(arrival);

  // A redelivery of a control ID already seen is at-least-once dispatch replaying a message, not
  // a reordering. It necessarily carries an ordinal at or below the key's high-water mark, so
  // letting it reach the check below would report every duplicate as a violation.
  if (controlId && state.seenControlIds.has(controlId)) {
    state.duplicates.push(controlId);
    return arrival;
  }
  state.seenControlIds.add(controlId);

  if (seq === undefined) {
    state.missingSeq++;
    return arrival;
  }

  // Compared against the highest ordinal seen for this key rather than the immediately previous
  // one, so a single out-of-order message is reported once instead of also flagging the
  // in-order message that follows it.
  const highest = state.highest.get(key);
  if (highest !== undefined && seq <= highest) {
    state.violations.push({ key, previous: highest, received: seq, controlId });
  } else {
    state.highest.set(key, seq);
  }
  return arrival;
}

/**
 * @param message - The received message.
 * @param runId - Substring the control ID must contain.
 * @returns True when the message belongs to the run under test.
 */
function messageMatchesRun(message: Hl7Message, runId: string): boolean {
  return (message.getSegment('MSH')?.getField(10)?.toString() ?? '').includes(runId);
}

/**
 * Prints the summary.
 * @param state - Accumulated state.
 * @param options - Resolved CLI options.
 * @returns True if no ordering violations were found.
 */
function summarize(state: State, options: Options): boolean {
  const byKey = new Map<string, Arrival[]>();
  for (const arrival of state.arrivals) {
    const list = byKey.get(arrival.key) ?? [];
    list.push(arrival);
    byKey.set(arrival.key, list);
  }

  console.log('');
  console.log(`  received           ${state.arrivals.length} message(s) across ${byKey.size} logical key(s)`);
  if (state.arrivals.length > 1 && state.firstAt !== undefined) {
    const lastAt = state.arrivals[state.arrivals.length - 1].at;
    const elapsedMs = lastAt - state.firstAt;
    const rate = elapsedMs > 0 ? (state.arrivals.length / elapsedMs) * 1000 : 0;
    console.log(`  first arrival      ${new Date(state.firstAt).toISOString()}`);
    console.log(`  last arrival       ${new Date(lastAt).toISOString()}`);
    console.log(`  elapsed            ${elapsedMs} ms  (${rate.toFixed(1)} msg/s average)`);
  }
  for (const [key, arrivals] of byKey) {
    const ordinals = arrivals.map((a) => a.seq ?? '?').join(',');
    console.log(`    ${key.padEnd(28)} ${arrivals.length.toString().padStart(3)}  ordinals: ${ordinals}`);
  }

  if (state.missingSeq > 0) {
    console.log('');
    console.log(
      `  ----  ${state.missingSeq}/${state.arrivals.length} message(s) had no numeric ${options.sequence}; those are counted but not ordered`
    );
  }
  if (state.duplicates.length > 0) {
    const pct = ((state.duplicates.length / state.arrivals.length) * 100).toFixed(2);
    console.log(
      `  ----  ${state.duplicates.length} redelivery/redeliveries of an already-seen control ID (${pct}% of arrivals),`
    );
    console.log('        expected under at-least-once dispatch; not counted as ordering violations');
    console.log(`        first few: ${state.duplicates.slice(0, 5).join(', ')}`);
  }
  if (state.ignored > 0) {
    console.log(`  ----  ignored ${state.ignored} message(s) not matching --run-id`);
  }

  console.log('');
  const ordered = state.violations.length === 0;
  if (ordered) {
    console.log(`  PASS  per-key ordering   ${options.sequence} strictly increasing within every logical key`);
  } else {
    console.log(`  FAIL  per-key ordering   ${state.violations.length} violation(s)`);
    for (const v of state.violations.slice(0, 20)) {
      console.log(`          ${v.key}: received ${v.received} after ${v.previous} (control id ${v.controlId})`);
    }
    if (options.runId === undefined) {
      console.log('        note: if another sender overlapped this run, its messages reuse the same keys');
      console.log('        and ordinals and will read as violations here. Re-run with --run-id to scope.');
    }
  }

  // Counted over distinct control IDs, not raw arrivals: dispatch retries redeliver a message
  // the Bot already pushed, so raw arrivals overshoot the target while messages are still owed.
  if (options.expect !== undefined && state.seenControlIds.size !== options.expect) {
    console.log(`  FAIL  expected count    ${state.seenControlIds.size}/${options.expect} distinct message(s) arrived`);
    return false;
  }
  return ordered;
}

/**
 * Starts the listener.
 * @param argv - Raw `process.argv`.
 */
export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (!options) {
    return;
  }

  const logger = consoleLogger();
  const keySpec = parseLogicalChannelKeySpec(options.key, logger);
  if (!keySpec || keySpec.length === 0) {
    throw new Error(`--key must be a valid non-empty spec, got '${options.key}'`);
  }
  const seqField = parseSingleField(options.sequence, '--sequence', logger);

  const state: State = {
    arrivals: [],
    violations: [],
    duplicates: [],
    highest: new Map(),
    seenControlIds: new Set(),
    missingSeq: 0,
    ignored: 0,
  };

  let done: (() => void) | undefined;
  let reachedExpect = false;
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });

  const server = new Hl7Server((connection) => {
    connection.addEventListener('message', (event) => {
      if (options.runId !== undefined && !messageMatchesRun(event.message, options.runId)) {
        state.ignored++;
        ackMessage(connection, event.message, options).catch((err) =>
          console.error(`ACK failed: ${normalizeErrorString(err)}`)
        );
        return;
      }
      const arrival = record(event.message, keySpec, seqField, state);
      if (!options.quiet) {
        console.log(
          [
            new Date(arrival.at).toISOString(),
            `+${arrival.at - (state.firstAt ?? arrival.at)}ms`.padStart(11),
            String(arrival.arrival).padStart(6),
            arrival.key.padEnd(28),
            `seq ${String(arrival.seq ?? '?').padStart(5)}`,
            arrival.controlId,
          ].join('  ')
        );
      }
      // ACK on a detached promise: the agent's outbound client is waiting on it, and awaiting
      // here would stall the connection's message pump behind --delay.
      ackMessage(connection, event.message, options).catch((err) =>
        console.error(`ACK failed: ${normalizeErrorString(err)}`)
      );
      // Reaching the target is announced, not acted on. The listener stays up until Ctrl-C:
      // closing the port the moment the count lands would strand any message still in flight,
      // and the agent would then be pushing into a dead socket.
      if (options.expect !== undefined && !reachedExpect && state.seenControlIds.size >= options.expect) {
        reachedExpect = true;
        console.log(`  ----  ${options.expect} distinct message(s) received; still listening, stop with Ctrl-C`);
      }
    });
  });

  const bound = await server.start(options.port);
  console.log(`Listening on ${bound}`);
  console.log(`  logical key        ${options.key}`);
  console.log(`  sequence field     ${options.sequence}`);
  console.log(
    options.expect === undefined
      ? '  stop with Ctrl-C'
      : `  expecting ${options.expect} distinct message(s); stop with Ctrl-C`
  );
  console.log('');

  process.on('SIGINT', () => done?.());
  await finished;

  if (!summarize(state, options)) {
    process.exitCode = 1;
  }
  await server.stop();
}

/**
 * Sends the application ACK, optionally after a delay.
 * @param connection - The connection the message arrived on.
 * @param message - The message to acknowledge.
 * @param options - Resolved CLI options.
 */
async function ackMessage(connection: Hl7Connection, message: Hl7Message, options: Options): Promise<void> {
  if (options.delayMs > 0) {
    await sleep(options.delayMs);
  }
  connection.send(message.buildAck());
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error(normalizeErrorString(err));
    process.exit(1);
  });
}
