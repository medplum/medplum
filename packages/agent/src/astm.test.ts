// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AstmMessage } from '@medplum/core';
import type { Mock } from 'vitest';
import { describe, expect, test } from 'vitest';
import type { AstmSessionOptions } from './astm';
import { AstmByte, astmChecksum, AstmSession } from './astm';
import { createMockLogger } from './test-utils';

const { STX, ETX, EOT, ENQ, ACK, NAK, CR, LF, ETB } = AstmByte;

/**
 * Builds one ASTM frame: `STX <seq> <text> CR <terminator> <checksum> CR LF`.
 *
 * @param seq - The single-digit frame sequence number.
 * @param text - The record text, without its terminating CR.
 * @param terminator - `ETB` for an intermediate frame, `ETX` for the final one.
 * @param checksum - Overrides the computed checksum, to simulate corruption on the wire.
 * @returns The framed bytes.
 */
function frame(seq: string, text: string, terminator: number = ETX, checksum?: string): Buffer {
  const covered = Buffer.concat([Buffer.from(`${seq}${text}`, 'utf-8'), Buffer.from([CR, terminator])]);
  return Buffer.concat([
    Buffer.from([STX]),
    covered,
    Buffer.from(checksum ?? astmChecksum(covered), 'utf-8'),
    Buffer.from([CR, LF]),
  ]);
}

type Harness = {
  session: AstmSession;
  replies: () => Buffer;
  messages: AstmMessage[];
  warnings: () => string[];
};

function createSession(options?: Partial<AstmSessionOptions>): Harness {
  const log = createMockLogger();
  const written: Buffer[] = [];
  const messages: AstmMessage[] = [];
  const session = new AstmSession(
    { log, ...options },
    { write: (reply) => written.push(reply), emit: (message) => messages.push(message) }
  );
  return {
    session,
    replies: () => Buffer.concat(written),
    messages,
    warnings: () => (log.warn as Mock).mock.calls.map((call) => String(call[0])),
  };
}

/**
 * @param messages - The messages a harness collected.
 * @returns Their bodies, as `toString()` renders them.
 */
function bodies(messages: AstmMessage[]): string[] {
  return messages.map((message) => message.toString());
}

describe('astmChecksum', () => {
  test('sums the covered bytes mod 256', () => {
    // '1' + 'A' + CR + ETX = 0x31 + 0x41 + 0x0d + 0x03 = 0x82.
    expect(astmChecksum(Buffer.from([0x31, 0x41, CR, ETX]))).toBe('82');
  });

  test.each([
    ['1H|\\^&|||BioRad^1.0|||||||P|1|20251217223735', ETB, '32'],
    ['2P|1||||Doe^John||19700101|M', ETX, '88'],
  ])('matches the real value for a BioRad frame (%#)', (covered, terminator, expected) => {
    // Pinned against captured traffic: this is what makes the covered byte range verifiable
    // rather than merely self-consistent.
    expect(astmChecksum(Buffer.concat([Buffer.from(covered, 'utf-8'), Buffer.from([CR, terminator])]))).toBe(expected);
  });

  test('wraps past 0xff', () => {
    expect(astmChecksum(Buffer.from([0xff, 0x01]))).toBe('00');
  });

  test('renders as two upper-case digits', () => {
    expect(astmChecksum(Buffer.from([0x0a]))).toBe('0A');
    expect(astmChecksum(Buffer.from([]))).toBe('00');
  });
});

describe('AstmSession', () => {
  describe('Handshake', () => {
    test('ENQ is acknowledged and opens a session', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));

      expect(h.replies()).toEqual(Buffer.from([ACK]));
      expect(h.session.inSession).toBe(true);
      expect(h.messages).toHaveLength(0);
    });

    test('an empty ENQ/EOT keepalive delivers nothing', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ, EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK]));
      expect(h.messages).toHaveLength(0);
      expect(h.session.inSession).toBe(false);
    });

    test('EOT with no open session is still acknowledged', () => {
      const h = createSession();
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK]));
      expect(h.messages).toHaveLength(0);
    });
  });

  describe('Frames', () => {
    test('a full transmission is acknowledged frame by frame and delivered at EOT', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'H|\\^&|||BioRad', ETB));
      h.session.consume(frame('2', 'P|1||PID123', ETX));
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK, ACK, ACK]));
      expect(bodies(h.messages)).toEqual(['H|\\^&|||BioRad\nP|1||PID123\n']);
    });

    test('ETB and ETX both terminate a frame', () => {
      const h = createSession();
      h.session.consume(Buffer.concat([Buffer.from([ENQ]), frame('1', 'A', ETB), frame('2', 'B', ETX)]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK, ACK]));
    });

    test('a frame carrying several CR-separated records yields several records', () => {
      const h = createSession();
      h.session.consume(Buffer.concat([Buffer.from([ENQ]), frame('1', `R|1|GLU|95\rR|2|NA|140`), Buffer.from([EOT])]));

      expect(h.messages[0].records.map((record) => record.text)).toEqual(['R|1|GLU|95', 'R|2|NA|140']);
    });

    test('a record continued into the next frame joins with no separator', () => {
      // An intermediate frame that ends without CR is a record split mid-way; inserting a
      // newline there would corrupt it into two records.
      const h = createSession();
      const first = Buffer.concat([Buffer.from([STX]), Buffer.from('1R|1|GLU|', 'utf-8'), Buffer.from([ETB])]);
      const covered = first.subarray(1);
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(Buffer.concat([first, Buffer.from(astmChecksum(covered), 'utf-8'), Buffer.from([CR, LF])]));
      h.session.consume(frame('2', '95'));
      h.session.consume(Buffer.from([EOT]));

      expect(h.messages[0].records.map((record) => record.text)).toEqual(['R|1|GLU|95']);
    });

    test('control bytes other than CR are stripped, printable bytes survive', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'A\x01B\x7fC'));
      h.session.consume(Buffer.from([EOT]));

      expect(bodies(h.messages)).toEqual(['AB\x7fC\n']);
    });
  });

  describe('Checksums', () => {
    test('a bad checksum is NAKed and its text discarded', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'CORRUPT', ETX, 'FF'));
      h.session.consume(frame('2', 'GOOD'));
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, NAK, ACK, ACK]));
      expect(bodies(h.messages)).toEqual(['GOOD\n']);
    });

    test('a retransmit after a NAK is accepted exactly once', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'RESULT', ETX, '00'));
      h.session.consume(frame('1', 'RESULT'));
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, NAK, ACK, ACK]));
      expect(bodies(h.messages)).toEqual(['RESULT\n']);
    });

    test('a lower-case checksum is accepted', () => {
      const h = createSession();
      const covered = Buffer.concat([Buffer.from('1ab', 'utf-8'), Buffer.from([CR, ETX])]);
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'ab', ETX, astmChecksum(covered).toLowerCase()));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK]));
    });

    test('non-hex checksum characters are NAKed like any mismatch', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'A', ETX, 'ZZ'));
      h.session.consume(frame('2', 'B'));

      expect(h.replies()).toEqual(Buffer.from([ACK, NAK, ACK]));
    });
  });

  describe('Chunk boundaries', () => {
    test('one byte at a time parses identically to one chunk', () => {
      const stream = Buffer.concat([
        Buffer.from([ENQ]),
        frame('1', 'H|\\^&', ETB),
        frame('2', 'P|1||PID123'),
        Buffer.from([EOT]),
      ]);

      const whole = createSession();
      whole.session.consume(stream);

      const dribbled = createSession();
      for (const byte of stream) {
        dribbled.session.consume(Buffer.from([byte]));
      }

      expect(dribbled.replies()).toEqual(whole.replies());
      expect(bodies(dribbled.messages)).toEqual(bodies(whole.messages));
    });

    test('a split between the two checksum characters is handled', () => {
      const h = createSession();
      const framed = frame('1', 'SPLIT');
      const cut = framed.length - 3; // between the checksum's two digits
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(framed.subarray(0, cut));
      h.session.consume(framed.subarray(cut));
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK, ACK]));
      expect(bodies(h.messages)).toEqual(['SPLIT\n']);
    });
  });

  describe('Session edges', () => {
    test('a frame with no preceding ENQ opens a session for itself', () => {
      const h = createSession();
      h.session.consume(frame('1', 'ORPHAN'));
      h.session.consume(Buffer.from([EOT]));

      expect(bodies(h.messages)).toEqual(['ORPHAN\n']);
      expect(h.warnings().some((warning) => warning.includes('no preceding ENQ'))).toBe(true);
    });

    test('a second ENQ delivers what was already accepted', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'FIRST'));
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'SECOND'));
      h.session.consume(Buffer.from([EOT]));

      expect(bodies(h.messages)).toEqual(['FIRST\n', 'SECOND\n']);
    });

    test('a second ENQ with nothing accepted just re-acknowledges', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ, ENQ]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK]));
      expect(h.messages).toHaveLength(0);
    });

    test('a repeated sequence number is acknowledged but appended once', () => {
      // The device's ACK went missing, so it re-sent a byte-identical frame.
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'ONCE'));
      h.session.consume(frame('1', 'ONCE'));
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK, ACK, ACK]));
      expect(bodies(h.messages)).toEqual(['ONCE\n']);
    });

    test('a sequence number outside 0-7 warns but is not NAKed', () => {
      // The checksum is the integrity mechanism; NAKing a frame the device believes is correct
      // just burns its retry budget and loses the batch.
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('9', 'ODD'));
      h.session.consume(Buffer.from([EOT]));

      expect(h.replies()).toEqual(Buffer.from([ACK, ACK, ACK]));
      expect(bodies(h.messages)).toEqual(['ODD\n']);
      expect(h.warnings().some((warning) => warning.includes('outside 0-7'))).toBe(true);
    });

    test('bytes between frames are ignored without disturbing the next frame', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(Buffer.from('garbage', 'utf-8'));
      h.session.consume(frame('1', 'CLEAN'));
      h.session.consume(Buffer.from([EOT]));

      expect(bodies(h.messages)).toEqual(['CLEAN\n']);
    });

    test('a frame restarting mid-frame discards the truncated one', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(Buffer.concat([Buffer.from([STX]), Buffer.from('1TRUNC', 'utf-8')]));
      h.session.consume(frame('2', 'WHOLE'));
      h.session.consume(Buffer.from([EOT]));

      expect(bodies(h.messages)).toEqual(['WHOLE\n']);
    });

    test('EOT mid-frame discards the truncated frame but delivers the rest', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'KEPT'));
      h.session.consume(Buffer.concat([Buffer.from([STX]), Buffer.from('2LOST', 'utf-8'), Buffer.from([EOT])]));

      expect(bodies(h.messages)).toEqual(['KEPT\n']);
      expect(h.replies()).toEqual(Buffer.from([ACK, ACK, ACK]));
    });

    test('abort discards an open session without delivering it', () => {
      const h = createSession();
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'DROPPED'));
      h.session.abort('socket closed');

      expect(h.messages).toHaveLength(0);
      expect(h.session.inSession).toBe(false);
      expect(h.warnings().some((warning) => warning.includes('socket closed'))).toBe(true);
    });

    test('abort when idle is silent', () => {
      const h = createSession();
      h.session.abort('socket closed');

      expect(h.warnings()).toHaveLength(0);
    });
  });

  describe('Runaway guards', () => {
    test('a frame with no terminator is rejected once it passes the cap', () => {
      const h = createSession({ maxFrameBytes: 32 });
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(Buffer.concat([Buffer.from([STX]), Buffer.from('1'.padEnd(64, 'X'), 'utf-8')]));

      expect(h.replies()).toEqual(Buffer.from([ACK, NAK]));

      // The receiver recovers: the next well-formed frame is accepted.
      h.session.consume(frame('2', 'AFTER'));
      h.session.consume(Buffer.from([EOT]));
      expect(bodies(h.messages)).toEqual(['AFTER\n']);
    });

    test('an oversized session is delivered early rather than dropped', () => {
      const h = createSession({ maxSessionBytes: 16 });
      h.session.consume(Buffer.from([ENQ]));
      h.session.consume(frame('1', 'X'.repeat(20)));
      h.session.consume(frame('2', 'TAIL'));
      h.session.consume(Buffer.from([EOT]));

      expect(bodies(h.messages)).toEqual([`${'X'.repeat(20)}\n`, 'TAIL\n']);
    });
  });
});
