// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AstmMessage } from './astm';

describe('AstmMessage', () => {
  test('splits record text into typed records', () => {
    const message = AstmMessage.parse('H|\\^&|||BioRad\nP|1||PID123\nL|1|N\n');

    expect(message.records.map((record) => record.type)).toEqual(['H', 'P', 'L']);
    expect(message.records[1].text).toBe('P|1||PID123');
  });

  test('drops blank lines so a trailing separator is harmless', () => {
    expect(AstmMessage.parse('H|1\n').records).toHaveLength(1);
    expect(AstmMessage.parse('').records).toHaveLength(0);
  });

  test('getRecords selects one record type', () => {
    const message = AstmMessage.parse('H|1\nR|1|GLU|95\nR|2|NA|140\nL|1|N\n');

    expect(message.getRecords('R').map((record) => record.text)).toEqual(['R|1|GLU|95', 'R|2|NA|140']);
    expect(message.getRecords('Q')).toEqual([]);
  });

  test('toString round-trips the record text', () => {
    const text = 'H|\\^&|||BioRad\nP|1||PID123\n';

    expect(AstmMessage.parse(text).toString()).toBe(text);
  });

  test('constructs directly from records', () => {
    const message = new AstmMessage([{ type: 'L', text: 'L|1|N' }]);

    expect(message.toString()).toBe('L|1|N\n');
  });
});
