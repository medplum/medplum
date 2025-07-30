import { Hl7Message } from '@medplum/core';
import iconv from 'iconv-lite';
import { Hl7Connection } from './connection';
import { CR, FS, VT } from './constants';
import { Hl7MessageEvent } from './events';

describe('HL7 Connection', () => {
  test('Error', async () => {
    const handlers: Record<string, (event: any) => void> = {};

    // Create a mock net.Socket
    const mockSocket: any = {
      on: jest.fn((event: string, handler: (event: any) => void) => {
        handlers[event] = handler;
        return mockSocket;
      }),
      setEncoding: jest.fn(() => mockSocket),
      end: jest.fn(),
      destroy: jest.fn(),
    };

    const listener = jest.fn();

    const connection = new Hl7Connection(mockSocket as any);
    expect(handlers.data).toBeDefined();
    expect(handlers.error).toBeDefined();

    // Listen for errors
    connection.addEventListener('error', listener);

    // Simulate an error
    handlers.error(new Error('test'));
    expect(listener).toHaveBeenCalledTimes(1);

    // Reset the listener
    listener.mockReset();

    // Simulate an invalid data event
    // this.socket.write(VT + reply.toString() + FS + CR);
    handlers.data(VT + FS + CR);
    expect(listener).toHaveBeenCalledTimes(1);

    // Close multiple times to test idempotency
    connection.close();
    connection.close();
  });

  test('enhancedMode', () => {
    const handlers: Record<string, (event: any) => void> = {};

    // Create a mock net.Socket
    const mockSocket: any = {
      on: jest.fn((event: string, handler: (event: any) => void) => {
        handlers[event] = handler;
        return mockSocket;
      }),
      setEncoding: jest.fn(() => mockSocket),
      end: jest.fn(),
      destroy: jest.fn(),
      write: jest.fn(),
    };

    const connection = new Hl7Connection(mockSocket as any, undefined, true);
    expect(handlers.data).toBeDefined();

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
    connection.close();
  });
});
