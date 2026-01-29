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
    practitioner2 = await makePractitioner({ timezone: 'America/New_York' });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSchedule(actor: Practitioner): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(actor)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'wed', 'thu'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
            },
          ],
        },
      ],
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
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
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
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
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

  test('it fails when trying to book outside of availability windows', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
    const schedule = await makeSchedule(practitioner);
    const start = '2026-01-15T07:00:00-04:00';
    const end = '2026-01-15T08:00:00-04:00';

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

    expect(response.body).toHaveProperty('issue', [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: 'No availability found at this time',
        },
      },
    ]);
    expect(response.status).toEqual(400);
  });

  test.each([
    // start of NYC window isn't in LA availability
    { start: '2026-01-15T09:00:00-04:00', end: '2026-01-15T10:00:00-04:00', succeeds: false },
    // end of LA window isn't in NYC availability
    { start: '2026-01-15T16:00:00-07:00', end: '2026-01-15T17:00:00-07:00', succeeds: false },
    // midday is in both windows
    { start: '2026-01-15T13:00:00-04:00', end: '2026-01-15T14:00:00-04:00', succeeds: true },
  ])('with practitioners in different timezones', async ({ start, end, succeeds }) => {
    const practitioner1 = await makePractitioner({ timezone: 'America/New_York' });
    const practitioner2 = await makePractitioner({ timezone: 'America/Los_Angeles' });
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

    if (succeeds) {
      expect(response.status).toEqual(201);
    } else {
      expect(response.status).toEqual(400);
    }
  });

  test('succeeds against an explicit "free" slot outside of regular availability', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/Phoenix' });
    const schedule = await makeSchedule(practitioner);
    const start = '2026-01-15T08:00:00-07:00';
    const end = '2026-01-15T09:00:00-07:00';

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

  test('succeeds over adjacent explicit "free" slots', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/Phoenix' });
    const schedule = await makeSchedule(practitioner);
    const start = '2026-01-15T08:00:00-07:00';
    const middle = '2026-01-15T08:30:00-07:00';
    const end = '2026-01-15T09:00:00-07:00';

    // First "free" slot covers 8am - 8:30am
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      start,
      end: middle,
      status: 'free',
      schedule: createReference(schedule),
      meta: { project: project.project.id },
    });

    // Second "free" slot covers 8:30am - 9am
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      start: middle,
      end,
      status: 'free',
      schedule: createReference(schedule),
      meta: { project: project.project.id },
    });

    // Requesting to book a slot from 8am - 9am works
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

  test('booking a slot with a different duration than scheduling parameters fails', async () => {
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
              end: '2026-01-15T14:30:00Z',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });

    expect(response.body).toHaveProperty('issue');
    expect(response.status).toEqual(400);
  });

  test.each([
    // alignmentInterval, alignmentOffset, start, end
    [20, 5, '2026-01-15T14:05:00-04:00', '2026-01-15T15:05:00-04:00'],
    [20, 5, '2026-01-15T14:25:00-04:00', '2026-01-15T15:25:00-04:00'],
    [20, 5, '2026-01-15T14:45:00-04:00', '2026-01-15T15:45:00-04:00'],
    [30, 15, '2026-01-15T14:15:00-04:00', '2026-01-15T15:15:00-04:00'],
    [30, 15, '2026-01-15T14:45:00-04:00', '2026-01-15T15:45:00-04:00'],
  ])(
    'booking a slot against parameters with alignment attributes',
    async (alignmentInterval, alignmentOffset, start, end) => {
      const schedule = await systemRepo.createResource<Schedule>({
        resourceType: 'Schedule',
        meta: { project: project.project.id },
        actor: [createReference(practitioner1)],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              {
                url: 'availability',
                valueTiming: {
                  repeat: {
                    dayOfWeek: ['tue', 'wed', 'thu'],
                    timeOfDay: ['09:00:00'],
                    duration: 8,
                    durationUnit: 'h',
                  },
                },
              },
              {
                url: 'duration',
                valueDuration: { value: 60, unit: 'min' },
              },
              {
                url: 'alignmentInterval',
                valueDuration: { value: alignmentInterval, unit: 'min' },
              },
              {
                url: 'alignmentOffset',
                valueDuration: { value: alignmentOffset, unit: 'min' },
              },
            ],
          },
        ],
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
      expect(response.status).toEqual(201);
    }
  );

  test.each([
    // alignmentInterval, alignmentOffset, start, end
    [20, 5, '2026-01-15T14:00:00-04:00', '2026-01-15T15:00:00-04:00'],
    [20, 5, '2026-01-15T14:10:00-04:00', '2026-01-15T15:10:00-04:00'],
  ])('attempting to book a misaligned slot fails', async (alignmentInterval, alignmentOffset, start, end) => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner1)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'wed', 'thu'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
            },
            {
              url: 'alignmentInterval',
              valueDuration: { value: alignmentInterval, unit: 'min' },
            },
            {
              url: 'alignmentOffset',
              valueDuration: { value: alignmentOffset, unit: 'min' },
            },
          ],
        },
      ],
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
    expect(response.status).toEqual(400);
  });

  test('with bufferBefore', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner1)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'wed', 'thu'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
            },
            {
              url: 'bufferBefore',
              valueDuration: { value: 20, unit: 'min' },
            },
          ],
        },
      ],
    });

    // Trying to book at the front of the availability window fails
    const response1 = await request
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
              start: '2026-01-15T09:00:00-05:00',
              end: '2026-01-15T10:00:00-05:00',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response1.status).toEqual(400);

    // Booking with buffer in the availability window succeeds
    const response2 = await request
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
              start: '2026-01-15T10:00:00-05:00',
              end: '2026-01-15T11:00:00-05:00',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response2.body).not.toHaveProperty('issue');
    expect(response2.status).toEqual(201);

    // It creates a bufferBefore slot with status: 'busy-unavailable
    const entries = ((response2.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);
    const bufferSlots = entries.filter(isSlot).filter((slot) => slot.status === 'busy-unavailable');
    expect(bufferSlots).toHaveLength(1);
    expect(bufferSlots).toMatchObject([
      {
        resourceType: 'Slot',
        start: '2026-01-15T14:40:00.000Z',
        end: '2026-01-15T15:00:00.000Z',
        schedule: createReference(schedule),
        status: 'busy-unavailable',
      },
    ]);

    // Trying to book immediately following the previously created booking
    // does not have availability due to lack of bufferBefore.
    const response3 = await request
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
              start: '2026-01-15T11:00:00-05:00',
              end: '2026-01-15T12:00:00-05:00',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response3.status).toEqual(400);
  });

  test('with bufferAfter', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner1)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'wed', 'thu'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'duration',
              valueDuration: { value: 30, unit: 'min' },
            },
            {
              url: 'bufferAfter',
              valueDuration: { value: 20, unit: 'min' },
            },
            {
              url: 'alignmentInterval',
              valueDuration: { value: 15, unit: 'min' },
            },
          ],
        },
      ],
    });

    // Trying to book at the end of the availability window fails
    const response1 = await request
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
              start: '2026-01-15T16:30:00-05:00',
              end: '2026-01-15T17:00:00-05:00',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response1.status).toEqual(400);

    // Booking with buffer in the availability window succeeds
    const response2 = await request
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
              start: '2026-01-15T16:00:00-05:00',
              end: '2026-01-15T16:30:00-05:00',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response2.body).not.toHaveProperty('issue');
    expect(response2.status).toEqual(201);

    // It creates a bufferAfter slot with status: 'busy-unavailable
    const entries = ((response2.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);
    const bufferSlots = entries.filter(isSlot).filter((slot) => slot.status === 'busy-unavailable');
    expect(bufferSlots).toHaveLength(1);
    expect(bufferSlots).toMatchObject([
      {
        resourceType: 'Slot',
        start: '2026-01-15T21:30:00.000Z',
        end: '2026-01-15T21:50:00.000Z',
        schedule: createReference(schedule),
        status: 'busy-unavailable',
      },
    ]);

    // Trying to book immediately before the previously created booking
    // does not have availability due to lack of bufferAfter.
    const response3 = await request
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
              start: '2026-01-15T15:15:00-05:00',
              end: '2026-01-15T15:45:00-05:00',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response3.status).toEqual(400);
  });
});

describe('scheduling flow integration test', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('a slot from $find can be used as input to $book', async () => {
    const practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/timezone',
          valueCode: 'America/Phoenix',
        },
      ],
    });

    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['tue', 'wed', 'thu'],
                  timeOfDay: ['09:00:00'],
                  duration: 8,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'duration',
              valueDuration: { value: 35, unit: 'min' },
            },
            {
              url: 'alignmentInterval',
              valueDuration: { value: 30, unit: 'min' },
            },
            {
              url: 'alignmentOffset',
              valueDuration: { value: 5, unit: 'min' },
            },
            {
              url: 'bufferBefore',
              valueDuration: { value: 10, unit: 'min' },
            },
            {
              url: 'bufferAfter',
              valueDuration: { value: 15, unit: 'min' },
            },
          ],
        },
      ],
    });

    const findResponse = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        start: new Date('2026-01-28T07:00:00.000-07:00'),
        end: new Date('2026-01-28T12:00:00.000-07:00'),
      });

    expect(findResponse.body).not.toHaveProperty('issue');
    expect(findResponse.status).toBe(200);
    expect(findResponse.body).toHaveProperty('entry');
    expect(findResponse.body.entry).toHaveLength(4);
    const proposedSlot: Slot = findResponse.body.entry[1].resource;

    const bookResponse = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'slot',
            resource: proposedSlot,
          },
        ],
      });

    expect(bookResponse.body).not.toHaveProperty('issue');
    expect(bookResponse.status).toBe(201);
  });
});
