// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  Operator,
  WithId,
  badRequest,
  createReference,
  getReferenceString,
  parseJWTPayload,
} from '@medplum/core';
import {
  AsyncJob,
  AuditEvent,
  Bot,
  Parameters,
  ParametersParameter,
  Project,
  ProjectMembership,
} from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../../admin/invite';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { getConfig, loadTestConfig } from '../../config/loader';
import * as oathKeysModule from '../../oauth/keys';
import { getLoginForAccessToken } from '../../oauth/utils';
import { getBinaryStorage } from '../../storage/loader';
import { createTestProject, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';

const botCodes = [
  [
    `
export async function handler(medplum, event) {
  console.log(JSON.stringify(event));
  return event.input;
}
  `,
    `
exports.handler = async function (medplum, event) {
  console.log(JSON.stringify(event));
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

type BotName = 'echoBot' | 'systemEchoBot' | 'booleanBot' | 'binaryBot';
const botDefinitions: { name: BotName; system: boolean; code: [string, string] }[] = [
  { name: 'systemEchoBot', system: true, code: botCodes[0] },
  { name: 'echoBot', system: false, code: botCodes[0] },
  { name: 'booleanBot', system: false, code: botCodes[1] },
  { name: 'binaryBot', system: false, code: botCodes[2] },
];

describe('Execute', () => {
  let app: express.Express;
  let project1: WithId<Project>;
  let accessToken1: string;
  const bots = {} as Record<BotName, WithId<Bot>>;

  beforeAll(async () => {
    app = express();
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);

    const testSetup = await createTestProject({
      project: {
        systemSecret: [
          { name: 'secret1', valueString: 'proj1systemValue1' },
          { name: 'secret2', valueString: 'proj1systemValue2' },
        ],
        secret: [
          { name: 'secret2', valueString: 'proj1value2' },
          { name: 'secret3', valueString: 'proj1value3' },
        ],
      },
      withAccessToken: true,
      membership: { admin: true },
    });
    project1 = testSetup.project;
    accessToken1 = testSetup.accessToken;

    async function setupBot(name: string, system: boolean, esmCode: string, cjsCode: string): Promise<WithId<Bot>> {
      const res1 = await request(app)
        .post('/fhir/R4/Bot')
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Authorization', 'Bearer ' + accessToken1)
        .send({
          resourceType: 'Bot',
          identifier: [{ system: 'https://example.com/bot', value: randomUUID() }],
          name: `${name} Test Bot`,
          runtimeVersion: 'vmcontext',
          code: esmCode,
          system,
        });

      expect(res1.status).toBe(201);
      const bot = res1.body as WithId<Bot>;

      const res2 = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Authorization', 'Bearer ' + accessToken1)
        .send({
          code: cjsCode,
        });

      expect(res2.status).toBe(200);

      return bot;
    }

    for (const { name, system, code } of botDefinitions) {
      bots[name] = await setupBot(name, system, code[0], code[1]);
    }
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Submit plain text', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
      .set('Content-Type', ContentType.TEXT)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send('input');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.text).toStrictEqual('input');
  });

  test('Submit FHIR with content type returns non-FHIR JSON', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: ['Doe'] }],
        identifier: [],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body.identifier).toStrictEqual([]);
  });

  test('Submit FHIR without content type return JSON content', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: ['Doe'] }],
        identifier: [],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body.identifier).toStrictEqual([]);
  });

  test('Return non-Resource JSON response', async () => {
    const input = { type: 'not-a-resource', result: [] };
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send(JSON.parse(JSON.stringify(input)));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toStrictEqual({ type: 'not-a-resource', result: [] });
  });

  test('Submit HL7', async () => {
    const binaryStorage = getBinaryStorage();
    const writeFileSpy = jest.spyOn(binaryStorage, 'writeFile');

    const text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';

    const res = await request(app)
      .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
      .set('Content-Type', ContentType.HL7_V2)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send(text);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('x-application/hl7-v2+er7; charset=utf-8');
    expect(writeFileSpy).toHaveBeenCalledTimes(1);

    const args = writeFileSpy.mock.calls[0];
    expect(args.length).toBe(3);
    expect(args[0]).toMatch(/^bot\//);
    expect(args[1]).toBe(ContentType.JSON);

    const row = JSON.parse(args[2] as string);
    expect(row.botId).toStrictEqual(bots.systemEchoBot.id);
    expect(row.hl7MessageType).toStrictEqual('ACK');
    expect(row.hl7Version).toStrictEqual('2.6.1');
  });

  test('Execute without code', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({});
    expect(res2.status).toBe(400);
  });

  test('Unsupported runtime version', async () => {
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
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
    expect(res3.body.issue[0].details.text).toStrictEqual('Bots not enabled');
  });

  test('VM context bot success', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
        runAsUser: true,
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

    // Try to execute before deploying
    // This should fail
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({});
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toStrictEqual('No executable code');

    // Update the bot with an invalid code URL
    const res3 = await request(app)
      .put(`/fhir/R4/Bot/${bot.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({});
    expect(res4.status).toBe(400);
    expect(res4.body.issue[0].details.text).toStrictEqual('Executable code is not a Binary');

    // Deploy the bot
    const res5 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        code: `
          const { getReferenceString } = require("@medplum/core");
          exports.handler = async function (medplum, event) {
            return {
              patient: getReferenceString({ resourceType: 'Patient', id: '123' }),
              bot: getReferenceString(event.bot),
              defaultHeaders: medplum.getDefaultHeaders(),
            }
          };
      `,
      });
    expect(res5.status).toBe(200);

    // Execute the bot success
    const res6 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .set('Cookie', '__medplum-test-cookie=123')
      .send({});
    expect(res6.status).toBe(200);
    expect(res6.body).toMatchObject({
      patient: 'Patient/123',
      bot: 'Bot/' + bot.id,
      defaultHeaders: {
        Cookie: '__medplum-test-cookie=123',
      },
    });

    // Disable VM context bots
    getConfig().vmContextBotsEnabled = false;

    // Try to execute when VM context bots are disabled
    // This should fail
    const res7 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({});
    expect(res7.status).toBe(400);
    expect(res7.body.issue[0].details.text).toStrictEqual('VM Context bots not enabled on this server');

    getConfig().vmContextBotsEnabled = true;
  });

  test('Handle number response', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({});
    expect(res6.status).toBe(200);
    expect(res6.body).toStrictEqual(42);
  });

  test('OperationOutcome response', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/$execute?identifier=invalid-identifier`)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send('');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toBe('application/fhir+json; charset=utf-8');
    expect(res.body).toMatchObject(badRequest('Must specify bot ID or identifier.'));
  });

  test('Binary response', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Bot/${bots.binaryBot.id}/$execute`)
      .set('Authorization', 'Bearer ' + accessToken1);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.text).toStrictEqual('Hello, world!');
  });

  test('runAsUser respects onBehalfOf', async () => {
    const { membership, profile } = await inviteUser({
      resourceType: 'Practitioner',
      project: project1,
      firstName: 'Test',
      lastName: 'User',
    });
    // Create a bot with empty code
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'vmcontext',
        runAsUser: true,
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

    // Deploy the bot
    const res5 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        code: `
          exports.handler = async function (medplum, event) {
            return {
              token: medplum.getAccessToken(),
            }
          };
      `,
      });
    expect(res5.status).toBe(200);

    // Execute the bot as self
    const res6 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({});
    expect(res6.status).toBe(200);
    const selfToken = parseJWTPayload(res6.body.token);
    expect(selfToken.profile).toMatch(/^ClientApplication\//);

    // Execute the bot with ProjectMembership ID
    const res7 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(membership))
      .send({});
    expect(res7.status).toBe(200);
    const membershipToken = parseJWTPayload(res7.body.token);
    expect(membershipToken.profile).toEqual(getReferenceString(profile));

    // Execute the bot with profile resource ID
    const res8 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(membership))
      .send({});
    expect(res8.status).toBe(200);
    const profileToken = parseJWTPayload(res8.body.token);
    expect(profileToken.profile).toEqual(getReferenceString(profile));
  });

  test('Propagates trace ID', async () => {
    // Create a bot with empty code
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken1)
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
      .set('Authorization', 'Bearer ' + accessToken1)
      .send({
        code: `
          exports.handler = async function (medplum, event) {
            return event.traceId;
          };
      `,
      });
    expect(res5.status).toBe(200);

    const traceId = randomUUID();

    // Execute the bot as self
    const res6 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Content-Type', ContentType.TEXT)
      .set('X-Trace-Id', traceId)
      .set('Authorization', 'Bearer ' + accessToken1)
      .send();
    expect(res6.text).toBe(traceId);
  });

  describe('linked project', () => {
    let project2: WithId<Project>;
    let accessToken2: string;

    beforeAll(async () => {
      // Create a new project that links to the first project
      const testSetup2 = await createTestProject({
        withAccessToken: true,
        project: {
          name: 'Project 2',
          systemSecret: [
            { name: 'secret2', valueString: 'proj2systemValue2' },
            { name: 'secret3', valueString: 'proj2systemValue3' },
          ],
          secret: [
            { name: 'secret3', valueString: 'proj2value3' },
            { name: 'secret4', valueString: 'proj2value4' },
          ],
          link: [{ project: createReference(project1) }],
        },
        membership: {
          admin: true,
        },
      });
      project2 = testSetup2.project;
      accessToken2 = testSetup2.accessToken;

      const systemRepo = getSystemRepo();
      for (const bot of [bots.echoBot, bots.systemEchoBot]) {
        await systemRepo.createResource<ProjectMembership>({
          resourceType: 'ProjectMembership',
          project: createReference(project2),
          user: createReference(bot),
          profile: createReference(bot),
        });

        // Confirm that we can read our own project
        const res1 = await request(app)
          .get(`/fhir/R4/Project/${project2.id}`)
          .set('Authorization', 'Bearer ' + accessToken2);
        expect(res1.status).toBe(200);
        expect(res1.body.resourceType).toBe('Project');
        expect(res1.body.id).toBe(project2.id);

        // Confirm that we can read the linked project
        const res2 = await request(app)
          .get(`/fhir/R4/Project/${project1.id}`)
          .set('Authorization', 'Bearer ' + accessToken2);
        expect(res2.status).toBe(200);
        expect(res2.body.resourceType).toBe('Project');
        expect(res2.body.id).toBe(project1.id);

        // Confirm that we can read the bot in the new project
        const res3 = await request(app)
          .get(`/fhir/R4/Bot/${bot.id}`)
          .set('Authorization', 'Bearer ' + accessToken2);
        expect(res3.status).toBe(200);
        expect(res3.body.resourceType).toBe('Bot');
        expect(res3.body.id).toBe(bot.id);
      }
    });

    function populateNamesInSecrets(expected: any): void {
      for (const key of Object.keys(expected)) {
        expected[key].name = key;
      }
    }

    test.each<[BotName, 'linking' | 'own', any]>([
      [
        'echoBot',
        'own',
        {
          secret2: { valueString: 'proj1value2' },
          secret3: { valueString: 'proj1value3' },
        },
      ],
      [
        'echoBot',
        'linking',
        {
          secret2: { valueString: 'proj1value2' },
          secret3: { valueString: 'proj2value3' },
          secret4: { valueString: 'proj2value4' },
        },
      ],
      [
        'systemEchoBot',
        'own',
        {
          secret1: { valueString: 'proj1systemValue1' },
          secret2: { valueString: 'proj1value2' },
          secret3: { valueString: 'proj1value3' },
        },
      ],
      [
        'systemEchoBot',
        'linking',
        {
          secret1: { valueString: 'proj1systemValue1' },
          secret2: { valueString: 'proj2systemValue2' },
          secret3: { valueString: 'proj2value3' },
          secret4: { valueString: 'proj2value4' },
        },
      ],
    ])('%s bot in %s project secrets', async (botName, whichProject, expectedSecrets) => {
      const bot = bots[botName];
      const systemRepo = getSystemRepo();

      // execute the bot in the appropriate project context
      const project = whichProject === 'own' ? project1 : project2;
      const accessToken = whichProject === 'own' ? accessToken1 : accessToken2;

      const res = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.text).toStrictEqual('input');

      // Get the audit event
      const auditEvent = await systemRepo.searchOne<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [
          { code: '_project', operator: Operator.EQUALS, value: project.id },
          { code: 'entity', operator: Operator.EQUALS, value: getReferenceString(bot) },
        ],
      });
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.meta?.project).toBe(project.id);

      // verify secrets
      const output = JSON.parse(auditEvent?.outcomeDesc as string);
      populateNamesInSecrets(expectedSecrets);
      expect(output.secrets).toStrictEqual(expectedSecrets);
    });

    test.each<[BotName, 'linking' | 'own']>([
      ['echoBot', 'linking'],
      ['echoBot', 'own'],
      ['systemEchoBot', 'linking'],
      ['systemEchoBot', 'own'],
    ])('Bot %s in %s project executes with correct accessToken', async (botName, whichProject) => {
      const generateAccessTokenSpy = jest.spyOn(oathKeysModule, 'generateAccessToken');
      generateAccessTokenSpy.mockClear();

      // execute the bot in the appropriate project context
      const bot = bots[botName];
      const accessToken = whichProject === 'own' ? accessToken1 : accessToken2;

      const res = await request(app)
        .post(`/fhir/R4/Bot/${bot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken)
        .send('input');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.text).toStrictEqual('input');

      expect(generateAccessTokenSpy).toHaveBeenCalledTimes(1);
      const generatedAccessToken = (await generateAccessTokenSpy.mock.results[0].value) as string;
      const authState = await getLoginForAccessToken(undefined, generatedAccessToken);

      const expectedProject = whichProject === 'own' ? project1 : project2;
      expect(authState?.project?.id).toBeDefined();
      expect(authState?.project?.id).toBe(expectedProject.id);
    });
  });

  describe('Prefer: respond-async', () => {
    test('Plain text -- Prefer: respond-async', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken1)
        .set('Prefer', 'respond-async')
        .send('input');
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken1);
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
        .post(`/fhir/R4/Bot/${bots.systemEchoBot.id}/$execute`)
        .set('Content-Type', ContentType.JSON)
        .set('Authorization', 'Bearer ' + accessToken1)
        .set('Prefer', 'respond-async')
        .send({ hello: 'medplum' });
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken1);
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
        .post(`/fhir/R4/Bot/${bots.booleanBot.id}/$execute`)
        .set('Content-Type', ContentType.TEXT)
        .set('Authorization', 'Bearer ' + accessToken1)
        .set('Prefer', 'respond-async')
        .send('input: true');
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken1);
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
        .set('Authorization', 'Bearer ' + accessToken1)
        .set('Prefer', 'respond-async')
        .send('input');
      expect(res.status).toBe(202);

      const job = await waitForAsyncJob(res.headers['content-location'], app, accessToken1);
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
