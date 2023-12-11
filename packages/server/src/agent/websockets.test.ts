import { allOk, ContentType, getReferenceString, Hl7Message } from '@medplum/core';
import { Agent, Bot, Device } from '@medplum/fhirtypes';
import express from 'express';
import { Server } from 'http';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { initTestAuth } from '../test.setup';

const app = express();
let config: MedplumServerConfig;
let server: Server;
let accessToken: string;
let bot: Bot;
let agent: Agent;
let device: Device;

describe('Agent WebSockets', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    config.vmContextBotsEnabled = true;

    server = await initApp(app, config);
    accessToken = await initTestAuth({}, { admin: true });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });

    // Create a test bot
    const res1 = await request(server)
      .post('/admin/projects/projectId/bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
      });
    bot = res1.body as Bot;

    // Deploy the bot
    // This is a simple HL7 ack bot
    // Note that the code is actually run inside a vmcontext
    await request(server)
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

    // Create an agent
    const res2 = await request(server)
      .post('/fhir/R4/Agent')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Agent',
        name: 'Test Agent',
        status: 'active',
        channel: [
          {
            name: 'test',
            endpoint: { reference: 'Endpoint/123' },
            targetReference: { reference: 'Bot/' + bot.id },
          },
        ],
      });
    agent = res2.body as Agent;

    const res3 = await request(server)
      .post(`/fhir/R4/Device`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Device',
        url: 'mllp://192.168.50.10:56001',
      });
    device = res3.body as Device;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      // Now transmit, should succeed
      .sendText(
        JSON.stringify({
          type: 'agent:transmit:request',
          accessToken,
          channel: 'test',
          remote: '0.0.0.0:57000',
          body:
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
            'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
            'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
        })
      )
      .expectText(
        /{"type":"agent:transmit:response","channel":"test","remote":"0.0.0.0:57000","contentType":"x-application\/hl7-v2\+er7","body":"MSH[^"]+ACK[^"]+"}/
      )
      .close()
      .expectClosed();
  });

  test('Send non-JSON', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText('<html></html>')
      .expectText(/{"type":"agent:error","body":"Unexpected token/)
      .close()
      .expectClosed();
  });

  test('Connect missing access token', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:error","body":"Missing access token"}')
      .close()
      .expectClosed();
  });

  test('Connect missing agentId', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
        })
      )
      .expectText('{"type":"agent:error","body":"Missing agent ID"}')
      .close()
      .expectClosed();
  });

  test('Transmit not connected', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'transmit',
          accessToken,
          channel: 'test',
          remote: '0.0.0.0:57000',
          body: 'MSH|...',
        })
      )
      .expectText('{"type":"agent:error","body":"Not connected"}')
      .close()
      .expectClosed();
  });

  test('Transmit missing access token', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .sendText(
        JSON.stringify({
          type: 'transmit',
          channel: 'test',
          remote: '0.0.0.0:57000',
          body: 'MSH|...',
        })
      )
      .expectText('{"type":"agent:error","body":"Missing access token"}')
      .close()
      .expectClosed();
  });

  test('Transmit missing channel', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .sendText(
        JSON.stringify({
          type: 'transmit',
          accessToken,
          remote: '0.0.0.0:57000',
          body: 'MSH|...',
        })
      )
      .expectText('{"type":"agent:error","body":"Missing channel"}')
      .close()
      .expectClosed();
  });

  test('Transmit channel not found', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .sendText(
        JSON.stringify({
          type: 'transmit',
          accessToken,
          channel: 'notfound',
          remote: '0.0.0.0:57000',
          body: 'MSH|...',
        })
      )
      .expectText('{"type":"agent:error","body":"Channel not found"}')
      .close()
      .expectClosed();
  });

  test('Transmit missing body', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .sendText(
        JSON.stringify({
          type: 'transmit',
          accessToken,
          channel: 'test',
          remote: '0.0.0.0:57000',
        })
      )
      .expectText('{"type":"agent:error","body":"Missing body"}')
      .close()
      .expectClosed();
  });

  test('Agent push', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .exec(async () => {
        const res = await request(server)
          .post(`/fhir/R4/Agent/${agent.id}/$push`)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            destination: getReferenceString(device),
            contentType: ContentType.HL7_V2,
            body:
              'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
              'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
              'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
        expect(res.body).toMatchObject(allOk);
      })
      .expectText(/{"type":"agent:transmit:request",.+,"body":"MSH[^"]+ADT1[^"]+"}/)
      .close()
      .expectClosed();
  });

  test('Push and wait for response timeout', async () => {
    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .exec(async () => {
        // Send a message that will never be responded to
        // Wait for the timeout
        const res = await request(server)
          .post(`/fhir/R4/Agent/${agent.id}/$push`)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            waitForResponse: true,
            destination: getReferenceString(device),
            contentType: ContentType.HL7_V2,
            body:
              'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
              'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
              'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          });
        expect(res.status).toBe(400);
        expect(res.body.issue[0].details.text).toBe('Timeout');
      })
      .close()
      .expectClosed();
  });

  test('Push and wait for response success', async () => {
    let pushRequest: any = undefined;
    let pushResponse: any = undefined;

    await request(server)
      .ws('/ws/agent')
      .sendText(
        JSON.stringify({
          type: 'agent:connect:request',
          accessToken,
          agentId: agent.id,
        })
      )
      .expectText('{"type":"agent:connect:response"}')
      .exec(async () => {
        // Send the request but do not wait for the response
        pushRequest = request(server)
          .post(`/fhir/R4/Agent/${agent.id}/$push`)
          .set('Content-Type', ContentType.JSON)
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            waitForResponse: true,
            channel: 'test',
            destination: getReferenceString(device),
            contentType: ContentType.HL7_V2,
            body:
              'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
              'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
              'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-',
          });
        pushRequest.then(() => true);
      })
      .expectText((str) => {
        const message = JSON.parse(str);
        expect(message.type).toBe('agent:transmit:request');
        expect(message.remote).toBe(device.url);
        expect(message.callback).toBeDefined();
        pushResponse = JSON.stringify({
          type: 'agent:transmit:response',
          callback: message.callback,
          contentType: ContentType.HL7_V2,
          body: Hl7Message.parse(message.body).buildAck().toString(),
        });
        return true;
      })
      .exec((ws) => ws.send(pushResponse))
      .exec(async () => {
        const res = await pushRequest;
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('x-application/hl7-v2+er7; charset=utf-8');
        expect(res.text).toMatch(/MSH.*ACK.*\r/);
      })
      .close()
      .expectClosed();
  });
});
