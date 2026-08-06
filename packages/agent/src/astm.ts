// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';

/**
 * ASTM E1381 link-level control bytes.
 *
 * These are fixed by the standard, not configurable: a device that speaks ASTM opens with
 * `ENQ`, frames with `STX`…`ETB`/`ETX`, and closes with `EOT`.
 */
export const AstmByte = {
  STX: 0x02,
  ETX: 0x03,
  EOT: 0x04,
  ENQ: 0x05,
  ACK: 0x06,
  LF: 0x0a,
  CR: 0x0d,
  NAK: 0x15,
  ETB: 0x17,
} as const;

/** E1381 caps a frame at 240 characters, so this is a sanity bound rather than a real limit. */
export const DEFAULT_ASTM_MAX_FRAME_BYTES = 64 * 1024;

/** Ceiling on one session's accumulated records before it is delivered early. */
export const DEFAULT_ASTM_MAX_SESSION_BYTES = 8 * 1024 * 1024;

/** Never mutated, so every connection can write the same instances. */
const ACK_REPLY = Buffer.from([AstmByte.ACK]);
const NAK_REPLY = Buffer.from([AstmByte.NAK]);

/**
 * Computes the ASTM E1381 frame checksum.
 *
 * Every byte after `STX` through the frame terminator inclusive — the sequence digit, the
 * record text, and the `ETB`/`ETX` itself — summed mod 256.
 *
 * @param payload - The checksum-covered bytes, terminator included.
 * @returns Two upper-case hex digits, the on-wire form.
 */
export function astmChecksum(payload: Buffer): string {
  let sum = 0;
  for (const byte of payload) {
    sum = (sum + byte) & 0xff;
  }
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

/** One E1394 record. `type` is its leading character: `H`, `P`, `O`, `R`, `C`, `Q`, `L`. */
export type AstmRecord = {
  readonly type: string;
  readonly text: string;
};

/**
 * One ASTM E1394 transmission — everything a device sent between `ENQ` and `EOT`.
 *
 * Deliberately independent of how the bytes arrived, so a serial channel can produce the same
 * object as the TCP byte-stream channel does. Records are modelled; fields are not, because
 * E1394 declares its delimiters inside the `H` record the way HL7 does in `MSH-1`/`MSH-2`, and
 * nothing here needs them yet.
 */
export class AstmMessage {
  private readonly recordList: readonly AstmRecord[];

  constructor(records: readonly AstmRecord[]) {
    this.recordList = records;
  }

  /**
   * Splits assembled record text into records.
   *
   * @param text - Record text, one record per line, as {@link AstmSession} accumulates it.
   * @returns The parsed message. Blank lines are dropped, so a trailing separator is harmless.
   */
  static parse(text: string): AstmMessage {
    const records: AstmRecord[] = [];
    for (const line of text.split('\n')) {
      if (line.length > 0) {
        records.push({ type: line[0], text: line });
      }
    }
    return new AstmMessage(records);
  }

  /** @returns The records, in the order the device sent them. */
  get records(): readonly AstmRecord[] {
    return this.recordList;
  }

  /** @returns The record text, one `\n`-terminated record per line. */
  toString(): string {
    let text = '';
    for (const record of this.recordList) {
      text += `${record.text}\n`;
    }
    return text;
  }
}

/** Where an {@link AstmSession} sends its link-level replies and completed transmissions. */
export interface AstmSessionHandlers {
  /** Writes a link-level reply — `ACK` or `NAK` — straight back to the device. */
  write(reply: Buffer): void;
  /** Delivers one completed transmission. Never called with an empty message. */
  emit(message: AstmMessage): void;
}

export interface AstmSessionOptions {
  readonly log: ILogger;
  readonly maxFrameBytes?: number;
  readonly maxSessionBytes?: number;
}

const AstmState = {
  /** No session open; waiting for `ENQ`. */
  Idle: 'idle',
  /** Session open, between frames. */
  AwaitFrame: 'awaitFrame',
  /** Next byte is the frame's sequence digit. */
  FrameSeq: 'frameSeq',
  /** Accumulating record text until `ETB`/`ETX`. */
  FrameText: 'frameText',
  /** Collecting the first of the two checksum characters. */
  ChecksumHigh: 'checksumHigh',
  /** Collecting the second, after which the frame is settled. */
  ChecksumLow: 'checksumLow',
} as const;
type AstmState = (typeof AstmState)[keyof typeof AstmState];

/**
 * ASTM E1381 receiver for a single byte stream.
 *
 * Answers the link-level handshake and assembles one `ENQ`…`EOT` transmission into an
 * {@link AstmMessage}, validating each frame's checksum and `NAK`ing the ones that fail so the
 * device retransmits rather than letting corruption reach the Bot.
 *
 * Transport-agnostic on purpose: it consumes `Buffer`s and writes through a callback, so a
 * serial channel can drive the same class. One instance per connection — a shared instance
 * would interleave two devices' frames into one message.
 *
 * Every decision is made from the current byte plus instance state, so a frame split across
 * any number of chunks, at any offset, parses identically to one that arrives whole.
 */
export class AstmSession {
  private readonly log: ILogger;
  private readonly handlers: AstmSessionHandlers;
  private readonly maxFrameBytes: number;
  private readonly maxSessionBytes: number;

  private state: AstmState = AstmState.Idle;
  /** The checksum-covered bytes of the frame in flight: sequence digit, text, terminator. */
  private frameBytes: number[] = [];
  private checksumChars = '';
  private frameSeq = -1;
  private lastAcceptedSeq = -1;
  private recordText = '';
  /** Bytes discarded outside any frame, reported once per session instead of once each. */
  private ignoredBytes = 0;

  constructor(options: AstmSessionOptions, handlers: AstmSessionHandlers) {
    this.log = options.log;
    this.handlers = handlers;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_ASTM_MAX_FRAME_BYTES;
    this.maxSessionBytes = options.maxSessionBytes ?? DEFAULT_ASTM_MAX_SESSION_BYTES;
  }

  /** @returns True while a transmission is open — `ENQ` seen, `EOT` not yet. */
  get inSession(): boolean {
    return this.state !== AstmState.Idle;
  }

  /**
   * Feeds the next chunk of the stream.
   * @param data - The bytes, at whatever boundaries the transport delivered them.
   */
  consume(data: Buffer): void {
    for (const byte of data) {
      this.step(byte);
    }
  }

  /**
   * Abandons an open transmission without delivering it.
   *
   * Only a complete `ENQ`…`EOT` transmission produces a message, so a device that disappears
   * mid-session has its accepted records dropped: it never saw the `EOT` acknowledged and
   * re-sends the transmission whole, which would otherwise duplicate every record.
   *
   * @param reason - Why the session ended, for the log.
   */
  abort(reason: string): void {
    if (this.inSession) {
      this.log.warn(
        `ASTM session abandoned (${reason}); discarding ${this.recordText.length} byte(s) of accepted records`
      );
    }
    this.resetSession();
  }

  private step(byte: number): void {
    switch (this.state) {
      case AstmState.Idle:
        this.stepIdle(byte);
        break;
      case AstmState.AwaitFrame:
        this.stepAwaitFrame(byte);
        break;
      case AstmState.FrameSeq:
        this.pushFrameByte(byte);
        this.frameSeq = byte;
        if (byte < 0x30 || byte > 0x37) {
          this.log.warn(`ASTM frame sequence ${byte} is outside 0-7; accepting the frame anyway`);
        }
        this.state = AstmState.FrameText;
        break;
      case AstmState.FrameText:
        this.stepFrameText(byte);
        break;
      case AstmState.ChecksumHigh:
        this.checksumChars = String.fromCharCode(byte);
        this.state = AstmState.ChecksumLow;
        break;
      case AstmState.ChecksumLow:
        this.checksumChars += String.fromCharCode(byte);
        this.settleFrame();
        break;
      default:
        this.state satisfies never;
    }
  }

  private stepIdle(byte: number): void {
    if (byte === AstmByte.ENQ) {
      this.startSession();
      this.handlers.write(ACK_REPLY);
    } else if (byte === AstmByte.EOT) {
      // Nothing to deliver, but the device is still owed its acknowledgement.
      this.handlers.write(ACK_REPLY);
    } else if (byte === AstmByte.STX) {
      // An agent restart or config reload can drop us into the middle of a transmission.
      // Dropping these frames loses results the device believes it already sent, so adopt them.
      this.log.warn('ASTM frame arrived with no preceding ENQ; starting a session for it');
      this.startSession();
      this.beginFrame();
    } else {
      this.ignoredBytes++;
    }
  }

  private stepAwaitFrame(byte: number): void {
    switch (byte) {
      case AstmByte.STX:
        this.beginFrame();
        break;
      case AstmByte.EOT:
        this.handlers.write(ACK_REPLY);
        this.endSession();
        break;
      case AstmByte.ENQ:
        // A device whose ACK went missing re-sends ENQ. Re-establishing is harmless when
        // nothing has been accepted; once records exist, they were ACKed and will not be
        // re-sent, so they go out as their own transmission rather than being dropped.
        if (this.recordText.length > 0) {
          this.log.warn('ASTM ENQ mid-session; delivering the records accepted so far');
          this.endSession();
        }
        this.startSession();
        this.handlers.write(ACK_REPLY);
        break;
      case AstmByte.CR:
      case AstmByte.LF:
      case 0x00:
        // The frame trailer and any padding. Tolerated so devices that omit, truncate or pad
        // it all behave the same.
        break;
      default:
        this.ignoredBytes++;
        break;
    }
  }

  private stepFrameText(byte: number): void {
    if (byte === AstmByte.ETB || byte === AstmByte.ETX) {
      this.pushFrameByte(byte);
      this.state = AstmState.ChecksumHigh;
      return;
    }

    // A frame that restarts or a session that ends mid-frame means the frame in flight is
    // truncated; drop it and resynchronize rather than checksumming a fragment.
    if (byte === AstmByte.STX) {
      this.log.warn('ASTM frame restarted before its terminator; discarding the truncated frame');
      this.beginFrame();
      return;
    }
    if (byte === AstmByte.EOT) {
      this.log.warn('ASTM session ended before the frame terminator; discarding the truncated frame');
      this.handlers.write(ACK_REPLY);
      this.endSession();
      return;
    }

    if (this.frameBytes.length >= this.maxFrameBytes) {
      this.log.warn(`ASTM frame exceeded ${this.maxFrameBytes} bytes with no terminator; rejecting it`);
      this.frameBytes = [];
      this.handlers.write(NAK_REPLY);
      this.state = AstmState.AwaitFrame;
      return;
    }

    this.pushFrameByte(byte);
  }

  private settleFrame(): void {
    const frame = Buffer.from(this.frameBytes);
    const expected = astmChecksum(frame);
    this.frameBytes = [];
    this.state = AstmState.AwaitFrame;

    if (this.checksumChars.toUpperCase() !== expected) {
      // Non-hex characters fail this comparison too, so they need no separate case.
      this.log.warn(
        `ASTM checksum mismatch: frame carried '${this.checksumChars}', computed '${expected}'; sending NAK`
      );
      this.handlers.write(NAK_REPLY);
      return;
    }

    this.handlers.write(ACK_REPLY);

    // The one thing the sequence number is load-bearing for: when our ACK is lost the device
    // re-sends a byte-identical frame, and appending it again would duplicate the record.
    if (this.frameSeq === this.lastAcceptedSeq) {
      this.log.warn(
        `ASTM frame ${this.checksumChars} repeats sequence ${this.frameSeq}; acknowledged but not appended`
      );
      return;
    }
    this.lastAcceptedSeq = this.frameSeq;
    this.appendRecordText(frame);
  }

  /**
   * Converts an accepted frame's payload into record text.
   *
   * Every `CR` becomes `LF`, not only the last: within frame text a `CR` can only be a record
   * terminator, so one rule covers a frame carrying several records and a record continued
   * into the next frame — the latter has no `CR` before its `ETB` and so joins seamlessly.
   * Remaining C0 bytes are dropped.
   *
   * @param frame - The checksum-covered bytes: sequence digit, text, terminator.
   */
  private appendRecordText(frame: Buffer): void {
    let text = '';
    // Skip the leading sequence digit and the trailing terminator.
    for (let i = 1; i < frame.length - 1; i++) {
      const byte = frame[i];
      if (byte === AstmByte.CR) {
        text += '\n';
      } else if (byte >= 0x20) {
        text += String.fromCharCode(byte);
      }
    }
    this.recordText += text;

    if (this.recordText.length >= this.maxSessionBytes) {
      // Delivering early beats both unbounded growth and dropping results on the floor.
      this.log.warn(`ASTM session exceeded ${this.maxSessionBytes} bytes; delivering it early and continuing`);
      this.deliver();
    }
  }

  private beginFrame(): void {
    this.frameBytes = [];
    this.checksumChars = '';
    this.frameSeq = -1;
    this.state = AstmState.FrameSeq;
  }

  private pushFrameByte(byte: number): void {
    this.frameBytes.push(byte);
  }

  private startSession(): void {
    this.recordText = '';
    this.lastAcceptedSeq = -1;
    this.ignoredBytes = 0;
    this.state = AstmState.AwaitFrame;
  }

  private endSession(): void {
    this.deliver();
    this.resetSession();
  }

  private deliver(): void {
    if (this.ignoredBytes > 0) {
      this.log.warn(`ASTM session ignored ${this.ignoredBytes} byte(s) outside any frame`);
      this.ignoredBytes = 0;
    }
    if (this.recordText.length === 0) {
      // An ENQ/EOT keepalive carries nothing; an empty transmit request would be pure noise.
      return;
    }
    this.handlers.emit(AstmMessage.parse(this.recordText));
    this.recordText = '';
  }

  private resetSession(): void {
    this.state = AstmState.Idle;
    this.frameBytes = [];
    this.checksumChars = '';
    this.frameSeq = -1;
    this.lastAcceptedSeq = -1;
    this.recordText = '';
    this.ignoredBytes = 0;
  }
}
