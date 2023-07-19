import { allOk, Hl7Message } from '@medplum/core';
import { Bot, Resource } from '@medplum/fhirtypes';
import { Hl7Client } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { App } from './main';

jest.mock('node-windows');

const medplum = new MockClient();
let bot: Bot;

describe('Agent', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
  });

  test('Runs successfully', async () => {
    const app = new App(medplum, bot);
    app.start();
    app.stop();
  });

  test('Send and receive', async () => {
    const app = new App(medplum, bot);
    app.start();

    const client = new Hl7Client({
      host: 'localhost',
      port: 56000,
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
    app.stop();
  });
});
