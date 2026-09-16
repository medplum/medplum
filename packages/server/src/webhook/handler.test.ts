// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import * as bots from '../bots/execute';
import { buildLambdaPayload } from '../cloud/aws/execute';
import { loadTestConfig } from '../config/loader';
import * as repo from '../fhir/repo';
import { createWebhookRawParser } from './bodyparser';
import { webhookHandler } from './routes';

const bot: Bot = { resourceType: 'Bot', id: 'test-bot', publicWebhook: true };
const membership: ProjectMembership = {
  resourceType: 'ProjectMembership',
  project: { reference: 'Project/test-project' },
  user: { reference: 'User/test-user' },
  profile: { reference: 'Bot/test-bot' },
  accessPolicy: { reference: 'AccessPolicy/test-policy' },
};
const app = express();
app.use(createWebhookRawParser({ type: 'application/json', limit: '10mb' }));
app.post('/webhook/:id', webhookHandler);

beforeAll(async () => {
  await loadTestConfig();
});

beforeEach(() => {
  delete bot.webhookRawBodyEnabled;
  vi.spyOn(repo, 'getGlobalSystemRepo').mockReturnValue({
    readResource: vi.fn().mockResolvedValue(membership),
  } as unknown as repo.SystemRepository);
  vi.spyOn(repo, 'getProjectSystemRepo').mockResolvedValue({
    readReference: vi.fn().mockResolvedValue(bot),
  } as unknown as repo.SystemRepository);
  vi.spyOn(bots, 'executeBot').mockImplementation(async ({ input, rawBody }) => ({
    success: true,
    logResult: '',
    returnValue: { input, rawBody },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

test.each([undefined, true, false])('Applies raw-body forwarding flag %s before runtime dispatch', async (enabled) => {
  bot.webhookRawBodyEnabled = enabled;
  const rawBody = '{ "value": 1.00 }\n';
  const result = await request(app).post('/webhook/test-membership').type('application/json').send(rawBody);
  expect(result.status).toBe(200);
  expect(result.body).toEqual(enabled === false ? { input: { value: 1 } } : { input: { value: 1 }, rawBody });
  expect(bots.executeBot).toHaveBeenCalledWith(
    expect.objectContaining({
      input: { value: 1 },
      rawBody: enabled === false ? undefined : rawBody,
    })
  );
});

test('Opting out preserves parsed input without duplicating a large Lambda payload', async () => {
  bot.webhookRawBodyEnabled = false;
  const input = { value: 'x'.repeat(3 * 1024 * 1024) };
  const body = JSON.stringify(input);
  const result = await request(app).post('/webhook/test-membership').type('application/json').send(body);
  expect(result.status).toBe(200);
  const invocation = vi.mocked(bots.executeBot).mock.calls[0][0];
  const payload = JSON.stringify(buildLambdaPayload({ ...invocation, accessToken: 'test-token', secrets: {} }));
  expect(JSON.parse(payload)).not.toHaveProperty('rawBody');
  expect(JSON.parse(payload).input).toEqual(input);
  expect(Buffer.byteLength(payload)).toBeLessThan(Buffer.byteLength(body) + 1024);
});
