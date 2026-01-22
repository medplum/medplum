// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Practitioner, Schedule } from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getSystemRepo } from '../../fhir/repo';
import type { TestProjectResult } from '../../test.setup';
import { createTestProject } from '../../test.setup';

const systemRepo = getSystemRepo();
const app = express();
const request = supertest(app);

describe('Appointment/$book', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner: Practitioner;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });
    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSchedule(): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner)],
    });
  }

  test('Succeeds with 201 Created', async () => {
    const schedule = await makeSchedule();
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: createReference(schedule),
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
            },
          },
        ],
      });
    expect(response.status).toEqual(201);
  });

  test('When referencing a nonexistent schedule', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: { reference: 'Schedule/fake-12345' },
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
            },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue');
  });
});
