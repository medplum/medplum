// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** One E1394 record. `type` is its leading character: `H`, `P`, `O`, `R`, `C`, `Q`, `L`. */
export type AstmRecord = {
  readonly type: string;
  readonly text: string;
};

/**
 * One ASTM E1394 transmission — everything a device sent between `ENQ` and `EOT`.
 *
 * Independent of how the bytes arrived, so a TCP byte-stream channel, a future serial channel
 * and a Bot parsing a transmit request all work with the same object. The E1381 link layer that
 * produces one — framing, checksums, `ACK`/`NAK` — lives in the agent, the same way
 * {@link Hl7Message} lives here while MLLP lives in `@medplum/hl7`.
 *
 * Records are modelled; fields are not. E1394 declares its delimiters inside the `H` record the
 * way HL7 does in `MSH-1`/`MSH-2`, so splitting fields properly is its own piece of work.
 */
export class AstmMessage {
  private readonly recordList: readonly AstmRecord[];

  constructor(records: readonly AstmRecord[]) {
    this.recordList = records;
  }

  /**
   * Splits record text into records.
   *
   * @param text - Record text, one record per line. This is the body of an
   * `x-application/astm-e1394` transmit request.
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

  /**
   * @param type - A record type character, e.g. `R` for a result record.
   * @returns Every record of that type.
   */
  getRecords(type: string): AstmRecord[] {
    return this.recordList.filter((record) => record.type === type);
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
