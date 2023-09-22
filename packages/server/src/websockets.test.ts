import { allOk, ContentType, Hl7Message } from '@medplum/core';
import { Agent, Bot } from '@medplum/fhirtypes';
import express from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from './app';
import { getConfig, loadTestConfig, MedplumServerConfig } from './config';
import { initTestAuth } from './test.setup';

const app = express();
let config: MedplumServerConfig;
let server: Server;
let accessToken: string;

describe('WebSockets', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    server = await initApp(app, config);
    accessToken = await initTestAuth({}, { admin: true });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Echo', async () => {
    await request(server)
      .ws('/ws/echo')
      .sendText('foo')
      .expectText('foo')
      .sendText('abc')
      .expectText('abc')
      .close()
      .expectClosed();
  });

  test('Agent', async () => {
    // Temporarily enable VM context bots
    getConfig().vmContextBotsEnabled = true;

    // Create a bot
    const res1 = await request(server)
      .post('/admin/projects/projectId/bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

    // Deploy the bot
    // This is a simple HL7 ack bot
    // Note that the code is actually run inside a vmcontext
    const res2 = await request(server)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
          exports.handler = async function (medplum, event) {
            return event.input.buildAck().toString();
          };
      `,
      });
    expect(res2.status).toBe(200);

    // Create an agent
    const res3 = await request(server)
      .post('/fhir/R4/Agent')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        channel: [{ endpoint: { reference: 'Endpoint/123' }, targetReference: { reference: 'Bot/' + bot.id } }],
      });
    expect(res3.status).toBe(201);

    const agent = res3.body as Agent;

    await request(server)
      .ws('/ws/agent')
      // Try to transmit before connecting
      // This should fail
      .sendText(
        JSON.stringify({
          type: 'transmit',
          message: Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
              'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
              'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
          ).toString(),
        })
      )
      .expectText('{"type":"error","message":"Not connected"}')
      // Now connect
      .sendText(
        JSON.stringify({
          type: 'connect',
          accessToken,
          agentId: agent.id,
          botId: bot.id,
        })
      )
      .expectText(JSON.stringify({ type: 'connected' }))
      // Now transmit
      // This should succeed
      .sendText(
        JSON.stringify({
          type: 'transmit',
          message: Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
              'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
              'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
          ).toString(),
        })
      )
      .expectText(/{"type":"transmit","message":"MSH[^"]+ACK[^"]+"}/)
      .close()
      .expectClosed();

    // Disable VM context bots
    getConfig().vmContextBotsEnabled = false;
  });

  test('Agent push', async () => {
    // Temporarily enable VM context bots
    getConfig().vmContextBotsEnabled = true;

    // Create a bot
    const res1 = await request(server)
      .post('/admin/projects/projectId/bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

    // Deploy the bot
    // This is a simple HL7 ack bot
    // Note that the code is actually run inside a vmcontext
    const res2 = await request(server)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
          exports.handler = async function (medplum, event) {
            return event.input.buildAck().toString();
          };
      `,
      });
    expect(res2.status).toBe(200);

    // Create an agent
    const res3 = await request(server)
      .post('/fhir/R4/Agent')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        channel: [{ endpoint: { reference: 'Endpoint/123' }, targetReference: { reference: 'Bot/' + bot.id } }],
      });
    expect(res3.status).toBe(201);

    const agent = res3.body as Agent;

    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'connect',
          accessToken,
          agentId: agent.id,
          botId: bot.id,
        })
      )
      .expectText(JSON.stringify({ type: 'connected' }))
      .exec(async () => {
        const res = await request(server)
          .post(`/fhir/R4/Agent/${agent.id}/$push`)
          .set('Content-Type', ContentType.HL7_V2)
          .set('Authorization', 'Bearer ' + accessToken)
          .send(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
              'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
              'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
          );
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
        expect(res.body).toMatchObject(allOk);
      })
      .expectText(/{"type":"transmit","message":"MSH[^"]+ADT1[^"]+"}/)
      .close()
      .expectClosed();

    // Disable VM context bots
    getConfig().vmContextBotsEnabled = false;
  });

  test('Invalid endpoint', async () => {
    await request(server).ws('/foo').expectConnectionError();
  });
});
