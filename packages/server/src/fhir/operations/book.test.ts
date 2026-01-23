// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, isDefined, parseSearchRequest } from '@medplum/core';
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
    practitioner1 = await makePractitioner({ timezone: 'America/New_York' });
    practitioner2 = await makePractitioner({ timezone: 'America/Phoenix' });
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

  async function makePractitioner({ timezone }: { timezone?: string } = {}): Promise<WithId<Practitioner>> {
    const extension = [];
    if (timezone) {
      extension.push({
        url: 'http://hl7.org/fhir/StructureDefinition/timezone',
        valueCode: timezone,
      });
    }
    return systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension,
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

  test('fails with Conflict when there is an overlapping busy slot booked', async () => {
    const practitioner = await makePractitioner();
    const schedule = await makeSchedule(practitioner);
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      start,
      end,
      status: 'busy',
      schedule: createReference(schedule),
      meta: { project: project.project.id },
    });

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

    // Status: Conflict
    expect(response.status).toEqual(409);

    // Check no appointment was created
    const appointments = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?practitioner=Practitioner/${practitioner.id}`)
    );
    expect(appointments).toHaveLength(0);

    // Check no additional slot was created
    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots).toHaveLength(1);
  });

  test('succeeds when there is an explicit "free" slot at the same time', async () => {
    const practitioner = await makePractitioner();
    const schedule = await makeSchedule(practitioner);
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      start,
      end,
      status: 'free',
      schedule: createReference(schedule),
      meta: { project: project.project.id },
    });

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
  });
});
