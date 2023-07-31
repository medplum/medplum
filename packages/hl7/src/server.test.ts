import { Hl7Message } from '@medplum/core';
import { Hl7Client } from './client';
import { Hl7Server } from './server';

describe('HL7 Server', () => {
  test('Start and stop', () => {
    const server = new Hl7Server(() => undefined);
    server.start(1234);
    server.stop();
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
    server.stop();
  });
});
