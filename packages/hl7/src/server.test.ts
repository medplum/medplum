import { Hl7Message } from '@medplum/core';
import { Hl7Client } from './client';
import { Hl7Server } from './server';

describe('HL7 Server', () => {
  test('Start and stop', async () => {
    const server = new Hl7Server(() => undefined);
    server.start(1234);
    await server.stop();
  });

  test('Send and receive', async () => {
    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    server.start(1234);

    const client = new Hl7Client({
      host: 'localhost',
      port: 1234,
    });

    await client.connect();

    const response = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );
    expect(response).toBeDefined();

    client.close();
    await server.stop();
  });

  test('Send and receive windows-1252', async () => {
    // HL7 messages are typically encoded in ASCII or ISO-8859-1
    // See: https://www.redoxengine.com/blog/everything-you-wanted-to-know-about-character-encoding-in-hl7-and-redox/
    const encoding = 'windows-1252';

    // Create a sample HL7 message with some special characters
    // Windows-1252: https://en.wikipedia.org/wiki/Windows-1252
    const patientName = 'Çödÿ';

    const message = Hl7Message.parse(
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        `PID|||PATID1234^5^M11||${patientName}||19610615|M-`
    );

    let receivedPatientName: string | undefined = undefined;

    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        receivedPatientName = message.getSegment('PID')?.getField(5)?.toString();
        connection.send(message.buildAck());
      });
    });

    server.start(1235, encoding);

    // First, connect with a client correctly configured for windows-1252
    // This should work correctly
    const client1 = new Hl7Client({
      host: 'localhost',
      port: 1235,
      encoding,
    });

    await client1.connect();

    const response1 = await client1.sendAndWait(message);
    expect(response1).toBeDefined();
    expect(receivedPatientName).toBe(patientName);
    client1.close();

    // Next, connect with a client configured for utf-8
    // This should produce invalid results due to the encoding mismatch
    // The special characters will be garbled
    // We add this test to demonstrate the importance of matching encodings
    const client2 = new Hl7Client({
      host: 'localhost',
      port: 1235,
      encoding: 'utf-8',
    });

    await client2.connect();

    const response2 = await client2.sendAndWait(message);
    expect(response2).toBeDefined();
    expect(receivedPatientName).toBe('Ã‡Ã¶dÃ¿');
    client2.close();

    // Shut down
    await server.stop();
  });

  test('Stop called when server not running', async () => {
    const hl7Server = new Hl7Server((_conn) => undefined);
    await expect(hl7Server.stop()).rejects.toThrow('Stop was called but there is no server running');
  });
});
