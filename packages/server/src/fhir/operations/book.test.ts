// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, isDefined, parseSearchRequest } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  Extension,
  HealthcareService,
  Patient,
  Practitioner,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getGlobalSystemRepo } from '../../fhir/repo';
import type { TestProjectResult } from '../../test.setup';
import { createTestProject } from '../../test.setup';
import { toCodeableReferenceLike } from '../../util/servicetype';
import type {
  SchedulingParametersExtension,
  SchedulingParametersExtensionExtension,
} from './utils/scheduling-parameters';

const systemRepo = getGlobalSystemRepo();
const app = express();
const request = supertest(app);

function isAppointment(obj: Resource): obj is Appointment {
  return obj.resourceType === 'Appointment';
}

function isSlot(obj: Resource): obj is Slot {
  return obj.resourceType === 'Slot';
}

const threeDayAvailability: SchedulingParametersExtensionExtension = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '09:00:00' },
        { url: 'availableEndTime', valueTime: '17:00:00' },
      ],
    },
  ],
};

describe('Appointment/$book', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner1: Practitioner;
  let practitioner2: Practitioner;
  let patient: Patient;
  let officeVisitService: WithId<HealthcareService>;
  let followupService: WithId<HealthcareService>;

  const officeVisit: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });
    practitioner1 = await makePractitioner({ timezone: 'America/New_York' });
    practitioner2 = await makePractitioner({ timezone: 'America/New_York' });
    patient = await makePatient();

    officeVisitService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [officeVisit],
      meta: { project: project.project.id },
    });

    followupService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Follow Up Visit',
      meta: { project: project.project.id },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function makeSchedulingExtension(opts?: {
    service?: WithId<HealthcareService>;
    duration?: number;
  }): SchedulingParametersExtension {
    const duration = opts?.duration ?? 60;
    const extension: SchedulingParametersExtension = {
      url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
      extension: [
        threeDayAvailability,
        {
          url: 'duration',
          valueDuration: { value: duration, unit: 'min' },
        },
      ],
    };

    if (opts?.service) {
      extension.extension.push({
        url: 'service',
        valueReference: createReference(opts.service),
      });
    }

    return extension;
  }

  async function makeSchedule(opts: { actor: Practitioner; extension?: Extension[] }): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(opts.actor)],
      serviceType: toCodeableReferenceLike(officeVisitService),
      extension: opts.extension ?? [makeSchedulingExtension({ service: officeVisitService })],
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

  async function makePatient(): Promise<WithId<Patient>> {
    return systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.project.id },
    });
  }

  test('Succeeds with 201 Created', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
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
              serviceType: toCodeableReferenceLike(officeVisitService),
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
              serviceType: [officeVisit],
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
    const schedule = await makeSchedule({ actor: practitioner1 });
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
              serviceType: [officeVisit],
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

    const slots = entries.filter(isSlot).filter((s) => s.status === 'busy');
    expect(slots).toHaveLength(1);
    expect(appointments[0].slot).toHaveLength(1);
    expect(appointments[0].slot?.[0]?.reference).toEqual(`Slot/${slots[0].id}`);
  });

  test('creates slots with status: "busy"', async () => {
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });
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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });

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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });

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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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

  test('when slots have different service types', async () => {
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });

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
              serviceType: toCodeableReferenceLike(officeVisitService),
            } satisfies Slot,
          },
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: createReference(schedule2),
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
              serviceType: toCodeableReferenceLike(followupService),
            } satisfies Slot,
          },
        ],
      });
    expect(response.body).toHaveProperty('issue', [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: 'Mismatched service types',
        },
      },
    ]);
    expect(response.status).toEqual(400);
  });

  test('fails with Conflict when there is an overlapping busy slot booked', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
    const schedule = await makeSchedule({ actor: practitioner });
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
              serviceType: [officeVisit],
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

  test('fails when trying to use a service type that does not match scheduling parameters', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
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
              serviceType: [
                {
                  coding: [{ code: 'other' }],
                },
              ],
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'No matching HealthcareService found' } }],
    });
    expect(response.status).toEqual(400);
  });

  test('succeeds when there is an explicit "free" slot at the same time', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
    const schedule = await makeSchedule({ actor: practitioner });
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
              serviceType: [officeVisit],
            } satisfies Slot,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);
  });

  test('it fails when trying to book outside of availability windows', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
    const schedule = await makeSchedule({ actor: practitioner });
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
              serviceType: [officeVisit],
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
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });

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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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
    const schedule = await makeSchedule({ actor: practitioner });
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
              serviceType: [officeVisit],
            } satisfies Slot,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);
  });

  test('succeeds over adjacent explicit "free" slots', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/Phoenix' });
    const schedule = await makeSchedule({ actor: practitioner });
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
              serviceType: [officeVisit],
            } satisfies Slot,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);
  });

  test('booking a slot with a different duration than scheduling parameters fails', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
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
              serviceType: [officeVisit],
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
        serviceType: toCodeableReferenceLike(officeVisitService),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              threeDayAvailability,
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
              {
                url: 'service',
                valueReference: createReference(officeVisitService),
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
                serviceType: [officeVisit],
              } satisfies Slot,
            },
          ],
        });
      expect(response.status).toEqual(201);
    }
  );

  test('with bufferBefore', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner1)],
      serviceType: toCodeableReferenceLike(officeVisitService),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            threeDayAvailability,
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
            },
            {
              url: 'bufferBefore',
              valueDuration: { value: 20, unit: 'min' },
            },
            {
              url: 'service',
              valueReference: createReference(officeVisitService),
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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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
      serviceType: toCodeableReferenceLike(officeVisitService),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            threeDayAvailability,
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
            {
              url: 'service',
              valueReference: createReference(officeVisitService),
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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
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
              serviceType: [officeVisit],
            } satisfies Slot,
          },
        ],
      });
    expect(response3.status).toEqual(400);
  });

  test('with a patient reference', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
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
              serviceType: [officeVisit],
            } satisfies Slot,
          },
          {
            name: 'patient-reference',
            valueReference: createReference(patient),
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
    expect(appointments[0]).toHaveProperty('participant');
    expect(appointments[0].participant).toEqual([
      {
        actor: createReference(practitioner1),
        status: 'tentative',
      },
      {
        actor: createReference(patient),
        status: 'accepted',
      },
    ]);
  });

  describe('Loading schedulingParameters from HealthcareService', () => {
    async function makeHealthcareService(serviceType: CodeableConcept, duration: number): Promise<void> {
      await systemRepo.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        meta: { project: project.project.id },
        type: [serviceType],
        availableTime: [
          {
            daysOfWeek: ['tue', 'wed', 'thu'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              {
                url: 'duration',
                valueDuration: { value: duration, unit: 'min' },
              },
            ],
          },
        ],
      });
    }

    async function makeScheduleNoParams(actor: Practitioner): Promise<WithId<Schedule>> {
      return systemRepo.createResource<Schedule>({
        resourceType: 'Schedule',
        meta: { project: project.project.id },
        actor: [createReference(actor)],
      });
    }

    test('succeeds when scheduling parameters are only on an HealthcareService', async () => {
      const serviceType = { coding: [{ system: 'http://example.com', code: 'consult' }] };
      await makeHealthcareService(serviceType, 60);
      const schedule = await makeSchedule({ actor: practitioner1, extension: [] });

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
                serviceType: [serviceType],
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T15:00:00Z',
                status: 'free',
              } satisfies Slot,
            },
          ],
        });

      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toEqual(201);
    });

    test('succeeds when the service-type has no system', async () => {
      const serviceType = { coding: [{ code: 'checkup' }] };
      await makeHealthcareService(serviceType, 60);
      const schedule = await makeSchedule({ actor: practitioner1, extension: [] });

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
                serviceType: [serviceType],
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T15:00:00Z',
                status: 'free',
              } satisfies Slot,
            },
          ],
        });

      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toEqual(201);
    });

    test('fails when multiple HealthcareServices match the slot service type tokens', async () => {
      // Two HealthcareServices sharing the same coding — the token-based fallback is
      // ambiguous and must fail rather than silently picking one.
      const sharedCode = { coding: [{ system: 'http://example.com', code: 'shared-svc' }] };
      await makeHealthcareService(sharedCode, 45);
      await makeHealthcareService(sharedCode, 60);
      const schedule = await makeScheduleNoParams(practitioner1);

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
                serviceType: [sharedCode],
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T15:00:00Z',
                status: 'free',
              } satisfies Slot,
            },
          ],
        });

      expect(response.status).toEqual(400);
      expect(response.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          { severity: 'error', code: 'invalid', details: { text: 'Multiple matching HealthcareServices found' } },
        ],
      });
    });

    test('fails when booking outside HealthcareService availability', async () => {
      const serviceType = { coding: [{ system: 'http://example.com', code: 'consult' }] };
      await makeHealthcareService(serviceType, 60);
      const schedule = await makeScheduleNoParams(practitioner1);

      // 07:00-08:00 ET is outside the 09:00-17:00 ET window
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
                serviceType: [serviceType],
                start: '2026-01-15T07:00:00-05:00',
                end: '2026-01-15T08:00:00-05:00',
                status: 'free',
              } satisfies Slot,
            },
          ],
        });

      expect(response.status).toEqual(400);
    });

    test('Schedule-specific parameters override HealthcareService parameters', async () => {
      // HealthcareService says 30-min slots; Schedule says 60-min slots for
      // the same service type.  A 60-min slot should succeed (Schedule wins),
      // a 30-min slot should fail (HealthcareService parameters are
      // overridden).
      const serviceType = { coding: [{ system: 'http://example.com', code: 'dentistry' }] };

      const service = await systemRepo.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        meta: { project: project.project.id },
        type: [serviceType],
        availableTime: [
          {
            daysOfWeek: ['tue', 'wed', 'thu'],
            availableStartTime: '09:00:00',
            availableEndTime: '17:00:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }],
          },
        ],
      });

      // Schedule overrides with 60-min slots for the same service type
      const schedule = await systemRepo.createResource<Schedule>({
        resourceType: 'Schedule',
        meta: { project: project.project.id },
        actor: [createReference(practitioner1)],
        serviceType: toCodeableReferenceLike(service),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              threeDayAvailability,
              { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
              { url: 'service', valueReference: createReference(service) },
            ],
          },
        ],
      });

      // 60-min slot succeeds (Schedule's configuration wins)
      const response60 = await request
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
                serviceType: [serviceType],
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T15:00:00Z',
                status: 'free',
              } satisfies Slot,
            },
          ],
        });
      expect(response60.body).not.toHaveProperty('issue');
      expect(response60.status).toEqual(201);

      // 30-min slot fails (HealthcareService duration was overridden by Schedule)
      const response30 = await request
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
                serviceType: [serviceType],
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T14:30:00Z',
                status: 'free',
              } satisfies Slot,
            },
          ],
        });
      expect(response30.status).toEqual(400);
      expect(response30.body).toHaveProperty('issue', [
        {
          severity: 'error',
          code: 'invalid',
          details: {
            text: 'No matching scheduling parameters found',
          },
        },
      ]);
    });
  });

  test('with an invalid patient reference', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
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
          {
            name: 'patient-reference',
            valueReference: { reference: 'Patient/404' },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: 'Invalid patient-reference',
        },
      },
    ]);
  });

  test('when the service type has no system attribute', async () => {
    const initialVisit: CodeableConcept = {
      text: 'Simple initial visit',
      coding: [{ code: 'simple-initial-visit' }],
    };

    const service = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      type: [initialVisit],
      meta: { project: project.project.id },
    });

    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner1)],
      serviceType: toCodeableReferenceLike(service),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'service',
              valueReference: createReference(service),
            },
            threeDayAvailability,
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
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
              serviceType: [initialVisit],
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              status: 'free',
            } satisfies Slot,
          },
        ],
      });
    expect(response.status).toEqual(201);
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

  const officeVisit: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  test('a slot from $find can be used as input to $book', async () => {
    const service = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [officeVisit],
      meta: { project: project.project.id },
    });

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
      serviceType: toCodeableReferenceLike(service),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            threeDayAvailability,
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
            {
              url: 'service',
              valueReference: createReference(service),
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
        'service-type-reference': `HealthcareService/${service.id}`,
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
