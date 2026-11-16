// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parameters, Questionnaire } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import type { Repository } from '../repo';

describe('Extraction canonical resolution', () => {
  const app = express();
  let repo: Repository;
  let token: string;

  beforeAll(async () => {
    await initApp(app, await loadTestConfig());
    ({ repo, accessToken: token } = await createTestProject({ withRepo: true, withAccessToken: true }));
  });
  afterAll(shutdownApp);

  function extract(canonical: string, questionnaire?: Questionnaire): request.Test {
    return request(app)
      .post('/fhir/R4/QuestionnaireResponse/$extract')
      .auth(token, { type: 'bearer' })
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'questionnaire-response',
            resource: { resourceType: 'QuestionnaireResponse', status: 'completed', questionnaire: canonical },
          },
          ...(questionnaire ? [{ name: 'questionnaire', resource: questionnaire }] : []),
        ],
      } satisfies Parameters);
  }

  test('selects an exact business version and never falls back to another version', async () => {
    const url = `https://example.org/${randomUUID()}`;
    await repo.createResource<Questionnaire>({ resourceType: 'Questionnaire', status: 'active', url, version: '1' });
    await repo.createResource<Questionnaire>({ resourceType: 'Questionnaire', status: 'active', url, version: '2' });
    expect((await extract(`${url}|1`)).status).toBe(200);
    const missing = await extract(`${url}|3`);
    expect(missing.status).toBe(400);
    expect(missing.body.issue[0].details.text).toContain('not found');
    const ambiguous = await extract(url);
    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body.issue[0].details.text).toContain('Multiple Questionnaires');
  });

  test('treats commas in business versions as literal characters', async () => {
    const url = `https://example.org/${randomUUID()}`;
    for (const version of ['1', '2', '1,2']) {
      await repo.createResource<Questionnaire>({ resourceType: 'Questionnaire', status: 'active', url, version });
    }
    expect((await extract(`${url}|1,2`)).status).toBe(200);
  });

  test.each([false, true])('rejects source/assembled ambiguity even with a pinned canonical: %s', async (versioned) => {
    const url = `https://example.org/${randomUUID()}`;
    const questionnaire: Questionnaire = { resourceType: 'Questionnaire', status: 'active', url, version: '1' };
    await repo.createResource(questionnaire);
    await repo.createResource(questionnaire);
    const canonical = url + (versioned ? '|1' : '');
    const res = await extract(canonical);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('supply the questionnaire parameter explicitly');
    expect((await extract(canonical, questionnaire)).status).toBe(200);
  });

  test('counts only accessible matches, with unchanged missing-resource behavior', async () => {
    const other = await createTestProject({ withRepo: true });
    const url = `https://example.org/${randomUUID()}`;
    const questionnaire: Questionnaire = { resourceType: 'Questionnaire', status: 'active', url, version: '1' };
    await other.repo.createResource(questionnaire);
    const invisible = await extract(`${url}|1`);
    expect(invisible.status).toBe(400);
    expect(invisible.body.issue[0].details.text).toContain('not found');
    await repo.createResource(questionnaire);
    expect((await extract(url)).status).toBe(200);
    expect((await extract(`${url}|1`)).status).toBe(200);
  });
});
