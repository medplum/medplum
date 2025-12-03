// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';

describe('CDS Hooks', () => {
  let app: express.Express;
  let accessToken: string;
  let cdsHookBot: WithId<Bot>;
  let normalBot: WithId<Bot>;

  beforeAll(async () => {
    app = express();
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);

    const testSetup = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    });
    accessToken = testSetup.accessToken;

    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: `CDS Hook Bot`,
        runtimeVersion: 'vmcontext',
        cdsService: {
          hook: 'patient-view',
          title: 'CDS Hook Bot',
          description: 'A bot for CDS Hooks testing',
          usageRequirements: 'For testing purposes only',
          prefetch: [
            {
              key: 'patientToGreet',
              query: 'Patient/{{context.patientId}}',
            },
          ],
        },
      });

    expect(res1.status).toBe(201);
    cdsHookBot = res1.body as WithId<Bot>;

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${cdsHookBot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        exports.handler = async function (medplum, event) {
          return {
            cards: [
              {
                summary: 'High-Risk: Patient has uncontrolled Diabetes and two documented severe allergies.',
                indicator: 'critical',
                detail:
                  "Patient's last HbA1c (8.9%) was 3 months ago. Severe allergies: Penicillin and Codeine. Review diabetic foot exam status.",
                source: {
                  label: 'Medplum Risk Monitor',
                  url: 'https://api.medplum.com/internal-risk-dashboard',
                },
              },
              {
                summary: 'Launch Comprehensive Patient Dashboard for quick risk review.',
                indicator: 'info',
                source: {
                  label: 'Medplum Care Planner',
                },
                links: [
                  {
                    label: 'Open Care Plan Dashboard',
                    url: 'https://ehr.example.com/fhir/R4/Patient/123/dashboard-app/launch',
                    type: 'smart',
                  },
                ],
              },
            ],
          };
        };
  `,
      });

    expect(res2.status).toBe(200);

    const res3 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: `Normal Bot`,
        runtimeVersion: 'vmcontext',
      });

    expect(res3.status).toBe(201);
    normalBot = res3.body as WithId<Bot>;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Discovery returns CDS hooks', async () => {
    const res = await request(app)
      .get('/cds-services')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      services: [
        {
          id: cdsHookBot.id,
          hook: 'patient-view',
          title: 'CDS Hook Bot',
          description: 'A bot for CDS Hooks testing',
          usageRequirements: 'For testing purposes only',
          prefetch: {
            patientToGreet: 'Patient/{{context.patientId}}',
          },
        },
      ],
    });
  });

  test('Call CDS hook bot', async () => {
    const res = await request(app)
      .post(`/cds-services/${cdsHookBot.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        hookInstance: 'd1577c69-dfbe-44ad-ba6d-3e05e953b2ea',
        hook: 'patient-view',
        context: {
          userId: 'Practitioner/example',
          patientId: '1288992',
          encounterId: '89284',
        },
        prefetch: {
          patientToGreet: {
            resourceType: 'Patient',
            gender: 'male',
            birthDate: '1925-12-23',
            id: '1288992',
            active: true,
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toBeDefined();
    expect(res.body.cards).toBeDefined();
  });

  test('Cannot call normal bot as CDS service', async () => {
    const res = await request(app)
      .post(`/cds-services/${normalBot.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: ['Doe'] }],
      });
    expect(res.status).toBe(404);
  });
});
