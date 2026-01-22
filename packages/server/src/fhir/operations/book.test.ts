// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, isDefined } from '@medplum/core';
import type { Appointment, Bundle, Practitioner, Resource, Schedule, Slot } from '@medplum/fhirtypes';
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

function isAppointment(obj: Resource): obj is Appointment {
  return obj.resourceType === 'Appointment';
}

function isSlot(obj: Resource): obj is Slot {
  return obj.resourceType === 'Slot';
}

describe('Appointment/$book', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner1: Practitioner;
  let practitioner2: Practitioner;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });
    practitioner1 = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    practitioner2 = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Phoenix' }],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSchedule(actor: Practitioner): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(actor)],
    });
  }

  test('Succeeds with 201 Created', async () => {
    const schedule = await makeSchedule(practitioner1);
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
            } satisfies Slot,
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

  test('creates an Appointment', async () => {
    const schedule = await makeSchedule(practitioner1);
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

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
              start,
              end,
              status: 'free',
            } satisfies Slot,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);

    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toHaveProperty('id');
    expect(appointments[0]).toHaveProperty('status', 'booked');
    expect(appointments[0]).toHaveProperty('start', start);
    expect(appointments[0]).toHaveProperty('end', end);
  });

  test('creates slots with status: "busy"', async () => {
    const schedule1 = await makeSchedule(practitioner1);
    const schedule2 = await makeSchedule(practitioner2);
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

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
              schedule: createReference(schedule1),
              start,
              end,
              status: 'free',
            } satisfies Slot,
          },
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: createReference(schedule2),
              start,
              end,
              status: 'free',
            } satisfies Slot,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);

    const slots = entries.filter(isSlot);
    expect(slots).toHaveLength(2);
    slots.forEach((slot) => {
      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('status', 'busy');
      expect(slot).toHaveProperty('start', start);
      expect(slot).toHaveProperty('end', end);
    });
  });

  test('with mismatched slot starts', async () => {
    const schedule1 = await makeSchedule(practitioner1);
    const schedule2 = await makeSchedule(practitioner2);

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
              schedule: createReference(schedule1),
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
            } satisfies Slot,
          },
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: createReference(schedule2),
              start: '2026-01-15T08:00:00Z',
              end: '2026-01-15T09:00:00Z',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response.body).toHaveProperty('issue', [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: 'Mismatched slot start times',
        },
      },
    ]);
    expect(response.status).toEqual(400);
  });

  test('with mismatched slot ends', async () => {
    const schedule1 = await makeSchedule(practitioner1);
    const schedule2 = await makeSchedule(practitioner2);

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
              schedule: createReference(schedule1),
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
            } satisfies Slot,
          },
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: createReference(schedule2),
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T14:30:00Z',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response.body).toHaveProperty('issue', [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: 'Mismatched slot end times',
        },
      },
    ]);
    expect(response.status).toEqual(400);
  });
});
