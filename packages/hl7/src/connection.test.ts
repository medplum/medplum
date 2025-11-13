// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message } from '@medplum/core';
import iconv from 'iconv-lite';
import { Hl7Connection } from './connection';
import { CR, FS, VT } from './constants';
import { Hl7MessageEvent } from './events';
import { MockSocket } from './test-utils';

describe('HL7 Connection', () => {
  test('Error', async () => {
    // Create a mock net.Socket
    const mockSocket = new MockSocket();
    const listener = jest.fn();

    const connection = new Hl7Connection(mockSocket as any);
    expect(mockSocket.handlers.data).toBeDefined();
    expect(mockSocket.handlers.error).toBeDefined();

    // Listen for errors
    connection.addEventListener('error', listener);

    // Simulate an error
    mockSocket.emit('error', new Error('test'));
    expect(listener).toHaveBeenCalledTimes(1);

    // Reset the listener
    listener.mockReset();

    // Simulate an invalid data event
    // this.socket.write(VT + reply.toString() + FS + CR);
    mockSocket.emit('data', VT + FS + CR);
    expect(listener).toHaveBeenCalledTimes(1);

    // Close multiple times to test idempotency
    await connection.close();
    await connection.close();
  });

  test('enhancedMode', async () => {
    const mockSocket = new MockSocket();

    const connection = new Hl7Connection(mockSocket as any, undefined, true);
    expect(mockSocket.handlers.data).toBeDefined();

    const msg =
      Hl7Message.parse(`MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||DFT^P03|MSG00002|P|2.3
EVN|P03|20240218153044
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^ST^12345^USA
FT1|1|ABC123|9876|20240218|20240218|CG|150.00|1|Units|||||||||||||99213^Office Visit^CPT
PR1|1||99213^Office Visit^CPT|20240218|GP||||||||||J45.909^Unspecified asthma, uncomplicated^ICD-10
PR1|2||85025^Blood Test^CPT|20240218|GP||||||||||D64.9^Anemia, unspecified^ICD-10
IN1|1|BCBS|67890|Blue Cross Blue Shield||||||||||||||||||||||||||||||||XYZ789`);

    connection.dispatchEvent(new Hl7MessageEvent(connection, msg));
    expect(mockSocket.write).toHaveBeenCalled();

    const writeBuffer = mockSocket.write.mock.calls[0][0] as Buffer;
    const decodedStr = iconv.decode(writeBuffer.subarray(1, writeBuffer.byteLength - 2), 'utf-8');

    const receivedMsg = Hl7Message.parse(decodedStr);
    const ackToCompare = msg.buildAck({ ackCode: 'CA' });

    // Timestamp is based on when ACK is created so these will always be different
    receivedMsg.getSegment('MSH')?.setField(7, 'TIMESTAMP');
    ackToCompare.getSegment('MSH')?.setField(7, 'TIMESTAMP');
    // Control ID is based on timestamp so they will always be different
    receivedMsg.getSegment('MSH')?.setField(10, 'CONTROLID');
    ackToCompare.getSegment('MSH')?.setField(10, 'CONTROLID');

    expect(receivedMsg.toString().replaceAll('\r', '\n')).toStrictEqual(ackToCompare.toString().replaceAll('\r', '\n'));
    await connection.close();
  });

  describe('parseMessages', () => {
    /**
     * Helper function to encode an HL7 message in MLLP format.
     * @param message - The HL7 message string.
     * @returns Buffer containing VT + message + FS + CR.
     */
    function encodeMessage(message: string): Buffer {
      const messageBuffer = iconv.encode(message, 'utf-8');
      const outputBuffer = Buffer.alloc(messageBuffer.length + 3);
      outputBuffer.writeInt8(VT, 0);
      messageBuffer.copy(outputBuffer, 1);
      outputBuffer.writeInt8(FS, messageBuffer.length + 1);
      outputBuffer.writeInt8(CR, messageBuffer.length + 2);
      return outputBuffer;
    }

    test('Multiple HL7 messages in one incoming chunk', async () => {
      const mockSocket = new MockSocket();
      const listener = jest.fn();

      const connection = new Hl7Connection(mockSocket as any);
      connection.addEventListener('message', listener);

      const msg1 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ADT^A01|MSG00001|P|2.3
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M`;

      const msg2 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153045||ADT^A02|MSG00002|P|2.3
PID|1||67890^^^MRN^MR||SMITH^JANE^B||19900101|F`;

      const msg3 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153046||ADT^A03|MSG00003|P|2.3
PID|1||11111^^^MRN^MR||JONES^BOB^C||19700101|M`;

      // Create buffer with all three messages
      const combinedBuffer = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2), encodeMessage(msg3)]);

      // Emit single data event with all messages
      mockSocket.emit('data', combinedBuffer);

      // Should receive all three messages
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener.mock.calls[0][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00001');
      expect(listener.mock.calls[1][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00002');
      expect(listener.mock.calls[2][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00003');

      await connection.close();
    });

    test('Partial message in a chunk', async () => {
      const mockSocket = new MockSocket();
      const listener = jest.fn();

      const connection = new Hl7Connection(mockSocket as any);
      connection.addEventListener('message', listener);

      const msg = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ADT^A01|MSG00001|P|2.3
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M`;

      const fullBuffer = encodeMessage(msg);
      const splitPoint = Math.floor(fullBuffer.length / 2);

      // Send first part
      mockSocket.emit('data', fullBuffer.subarray(0, splitPoint));
      expect(listener).not.toHaveBeenCalled();

      // Send second part
      mockSocket.emit('data', fullBuffer.subarray(splitPoint));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00001');

      await connection.close();
    });

    test('Random bytes before an HL7 message should be ignored', async () => {
      const mockSocket = new MockSocket();
      const listener = jest.fn();

      const connection = new Hl7Connection(mockSocket as any);
      connection.addEventListener('message', listener);

      const msg = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ADT^A01|MSG00001|P|2.3
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M`;

      // Add random bytes before the message
      const randomBytes = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const messageBuffer = encodeMessage(msg);
      const combinedBuffer = Buffer.concat([randomBytes, messageBuffer]);

      mockSocket.emit('data', combinedBuffer);

      // Should still receive the message, ignoring the random bytes
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00001');

      await connection.close();
    });

    test('Random bytes between multiple messages should be ignored', async () => {
      const mockSocket = new MockSocket();
      const listener = jest.fn();

      const connection = new Hl7Connection(mockSocket as any);
      connection.addEventListener('message', listener);

      const msg1 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ADT^A01|MSG00001|P|2.3
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M`;

      const msg2 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153045||ADT^A02|MSG00002|P|2.3
PID|1||67890^^^MRN^MR||SMITH^JANE^B||19900101|F`;

      // Add random bytes between messages
      const randomBytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const combinedBuffer = Buffer.concat([encodeMessage(msg1), randomBytes, encodeMessage(msg2)]);

      mockSocket.emit('data', combinedBuffer);

      // Should receive both messages, ignoring the random bytes between them
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00001');
      expect(listener.mock.calls[1][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00002');

      await connection.close();
    });

    test('Bytes at the end should be ignored and next message should be processed successfully', async () => {
      const mockSocket = new MockSocket();
      const listener = jest.fn();

      const connection = new Hl7Connection(mockSocket as any);
      connection.addEventListener('message', listener);

      const msg1 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ADT^A01|MSG00001|P|2.3
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M`;

      const msg2 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153045||ADT^A02|MSG00002|P|2.3
PID|1||67890^^^MRN^MR||SMITH^JANE^B||19900101|F`;

      const msg3 = `MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153046||ADT^A03|MSG00003|P|2.3
PID|1||11111^^^MRN^MR||JONES^BOB^C||19700101|M`;

      // Add random bytes at the end
      const trailingBytes = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
      const combinedBuffer = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2), trailingBytes]);

      mockSocket.emit('data', combinedBuffer);

      // Should receive both messages successfully
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00001');
      expect(listener.mock.calls[1][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00002');

      // Now send another message - the trailing bytes should be ignored and the new message should be processed
      mockSocket.emit('data', encodeMessage(msg3));

      // Should receive the third message
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener.mock.calls[2][0].message.getSegment('MSH')?.getField(10)?.toString()).toBe('MSG00003');

      await connection.close();
    });
  });
});
