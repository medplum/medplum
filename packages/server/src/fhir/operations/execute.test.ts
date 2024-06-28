import { ContentType, allOk, badRequest } from '@medplum/core';
import { AsyncJob, Bot, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { getConfig, loadTestConfig } from '../../config';
import { initTestAuth, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getBinaryStorage } from '../storage';

describe('Execute', () => {
  let app: express.Express;
  let accessToken: string;
  const bots = [] as Bot[];

  const botCodes = [
    [
      `
export async function handler(medplum, event) {
  console.log('input', event.input);
  return event.input;
}
  `,
      `
exports.handler = async function (medplum, event) {
  console.log('input', event.input);
  return event.input;
};
`,
    ],
    [
      `
export async function handler(medplum, event) {
  console.log('input', event.input);
  if (event.input === 'input: true') {
    return true;
  } else if (event.input === 'input: false') {
    return false;
  } else {
    throw new Error('Invalid boolean');
  }
}
  `,
      `
exports.handler = async function (medplum, event) {
  console.log('input', event.input);
  if (event.input === 'input: true') {
    return true;
  } else if (event.input === 'input: false') {
    return false;
  } else {
    throw new Error('Invalid boolean');
  }
};
`,
    ],
    [
      `
export async function handler(medplum, event) {
  return {
    resourceType: 'Binary',
    contentType: 'text/plain',
    data: '${Buffer.from('Hello, world!').toString('base64')}'
  };
}
  `,
      `
exports.handler = async function (medplum, event) {
  return {
    resourceType: 'Binary',
    contentType: 'text/plain',
    data: '${Buffer.from('Hello, world!').toString('base64')}'
  };
};
`,
    ],
  ] as [string, string][];

  beforeAll(async () => {
    app = express();
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);
    accessToken = await initTestAuth();

    for (let i = 0; i < botCodes.length; i++) {
      const [esmCode, cjsCode] = botCodes[i];

      const res1 = await request(app)
        .post('/fhir/R4/Bot')
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Bot',
          identifier: [{ system: 'https://example.com/bot', value: randomUUID() }],
          name: `Test Bot #${i + 1}`,
          runtimeVersion: 'vmcontext',
          code: esmCode,
        });

      expect(res1.status).toBe(201);
      const bot = res1.body as Bot;

      const res2 = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          code: cjsCode,
        });

      expect(res2.status).toBe(200);
      bots[i] = bot;
    }
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Submit plain text', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
      .set('Content-Type', ContentType.TEXT)
      .set('Authorization', 'Bearer ' + accessToken)
      .send('input');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.text).toEqual('input');
  });

  test('Submit FHIR with content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: ['Doe'] }],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
  });

  test('Submit FHIR without content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: ['Doe'] }],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  test('Submit HL7', async () => {
    const binaryStorage = getBinaryStorage();
    const writeFileSpy = jest.spyOn(binaryStorage, 'writeFile');

    const text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';

    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
      .set('Content-Type', ContentType.HL7_V2)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(text);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('x-application/hl7-v2+er7; charset=utf-8');
    expect(writeFileSpy).toHaveBeenCalledTimes(1);

    const args = writeFileSpy.mock.calls[0];
    expect(args.length).toBe(3);
    expect(args[0]).toMatch(/^bot\//);
    expect(args[1]).toBe(ContentType.JSON);

    const row = JSON.parse(args[2] as string);
    expect(row.botId).toEqual(bots[0].id);
    expect(row.hl7MessageType).toEqual('ACK');
    expect(row.hl7Version).toEqual('2.6.1');
  });

  test('Execute without code', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        code: '',
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

    // Execute the bot
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res2.status).toBe(400);
  });

  test('Unsupported runtime version', async () => {
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'unsupported',
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

    // Step 2: Publish the bot
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res2.status).toBe(200);

    // Step 3: Execute the bot
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res3.status).toBe(400);
  });

  test('Bots not enabled', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Next, Alice creates a bot
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('Bot');
    expect(res2.body.id).toBeDefined();
    expect(res2.body.sourceCode).toBeDefined();

    // Try to execute the bot
    // This should fail because bots are not enabled
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${res2.body.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res3.status).toBe(400);
    expect(res3.body.issue[0].details.text).toEqual('Bots not enabled');
  });

  test('VM context bot success', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

    // Try to execute before deploying
    // This should fail
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toEqual('No executable code');

    // Update the bot with an invalid code URL
    const res3 = await request(app)
      .put(`/fhir/R4/Bot/${bot.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        ...bot,
        executableCode: {
          contentType: ContentType.JAVASCRIPT,
          url: 'https://example.com/invalid.js',
        },
      });
    expect(res3.status).toBe(200);

    // Try to execute with invalid code URL
    // This should fail
    const res4 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res4.status).toBe(400);
    expect(res4.body.issue[0].details.text).toEqual('Executable code is not a Binary');

    // Deploy the bot
    const res5 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
          const { getReferenceString } = require("@medplum/core");
          exports.handler = async function (_medplum, event) {
            return {
              patient: getReferenceString({ resourceType: 'Patient', id: '123' }),
              bot: getReferenceString(event.bot),
            }
          };
      `,
      });
    expect(res5.status).toBe(200);

    // Execute the bot success
    const res6 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res6.status).toBe(200);
    expect(res6.body).toMatchObject({
      patient: 'Patient/123',
      bot: 'Bot/' + bot.id,
    });

    // Disable VM context bots
    getConfig().vmContextBotsEnabled = false;

    // Try to execute when VM context bots are disabled
    // This should fail
    const res7 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res7.status).toBe(400);
    expect(res7.body.issue[0].details.text).toEqual('VM Context bots not enabled on this server');

    getConfig().vmContextBotsEnabled = true;
  });

  test('Handle number response', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

    // Deploy the bot
    const res5 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
          exports.handler = async function () {
            return 42;
          };
      `,
      });
    expect(res5.status).toBe(200);

    // Execute the bot success
    const res6 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res6.status).toBe(200);
    expect(res6.body).toEqual(42);
  });

  test('OperationOutcome response', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(allOk);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
    expect(res.body).toMatchObject(allOk);
  });

  test('Binary response', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Bot/${bots[2].id}/$execute`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.text).toEqual('Hello, world!');
  });

  describe('Prefer: respond-async', () => {
    test('Plain text -- Prefer: respond-async', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Prefer', 'respond-async')
        .send('input');
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect(job).toMatchObject<Partial<AsyncJob>>({
        resourceType: 'AsyncJob',
        status: 'completed',
        request: expect.stringContaining('$execute'),
        output: expect.objectContaining<Parameters>({
          resourceType: 'Parameters',
          parameter: expect.arrayContaining<ParametersParameter>([
            expect.objectContaining<ParametersParameter>({
              name: 'responseBody',
              valueString: 'input',
            }),
          ]),
        }),
      });
    });

    test('JSON -- Prefer: respond-async', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Bot/${bots[0].id}/$execute`)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Prefer', 'respond-async')
        .send({ hello: 'medplum' });
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect(job).toMatchObject<Partial<AsyncJob>>({
        resourceType: 'AsyncJob',
        status: 'completed',
        request: expect.stringContaining('$execute'),
        output: expect.objectContaining<Parameters>({
          resourceType: 'Parameters',
          parameter: expect.arrayContaining<ParametersParameter>([
            expect.objectContaining<ParametersParameter>({
              name: 'responseBody',
              valueString: JSON.stringify({ hello: 'medplum' }),
            }),
          ]),
        }),
      });
    });

    test('Boolean -- Prefer: respond-async', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Bot/${bots[1].id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Prefer', 'respond-async')
        .send('input: true');
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect(job).toMatchObject<Partial<AsyncJob>>({
        resourceType: 'AsyncJob',
        status: 'completed',
        request: expect.stringContaining('$execute'),
        output: expect.objectContaining<Parameters>({
          resourceType: 'Parameters',
          parameter: expect.arrayContaining<ParametersParameter>([
            expect.objectContaining<ParametersParameter>({
              name: 'responseBody',
              valueBoolean: true,
            }),
          ]),
        }),
      });
    });

    test('No Bot ID -- Prefer: respond-async', async () => {
      const res = await request(app)
        .post('/fhir/R4/Bot/$execute')
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Prefer', 'respond-async')
        .send('input');
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect(job).toMatchObject<Partial<AsyncJob>>({
        resourceType: 'AsyncJob',
        status: 'error',
        request: expect.stringContaining('$execute'),
        output: expect.objectContaining<Parameters>({
          resourceType: 'Parameters',
          parameter: expect.arrayContaining<ParametersParameter>([
            expect.objectContaining<ParametersParameter>({
              name: 'outcome',
              resource: badRequest('Must specify bot ID or identifier.'),
            }),
          ]),
        }),
      });
    });
  });
});
