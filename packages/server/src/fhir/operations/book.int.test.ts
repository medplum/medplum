// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString, isDefined, parseSearchRequest } from '@medplum/core';
import type {
  AccessPolicy,
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
import { addTestUser, createTestProject } from '../../test.setup';
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

  const officeVisit: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    // try to be more resilient to concurrent tests touching the same tables
    config.transactionAttempts = 5;
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

  async function makeSchedule(opts: {
    actor: Practitioner;
    extension?: Extension[];
    planningHorizon?: Schedule['planningHorizon'];
  }): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(opts.actor)],
      serviceType: toCodeableReferenceLike(officeVisitService),
      extension: opts.extension ?? [makeSchedulingExtension({ service: officeVisitService })],
      planningHorizon: opts.planningHorizon,
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

  test('When referencing a nonexistent schedule', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: { reference: 'Schedule/fake-12345' },
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        details: {
          text: 'Schedule load failed',
        },
        expression: ['Parameters.appointment.contained[0].schedule'],
        severity: 'error',
      },
    ]);
  });

  test('creates a "booked" appointment with "busy" slots', async () => {
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [
                { actor: schedule1.actor[0], status: 'tentative' },
                { actor: schedule2.actor[0], status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start,
                  end,
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);

    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toHaveProperty('id');
    expect(appointments[0]).toMatchObject({
      status: 'booked',
      start,
      end,
    });

    // The return bundle has two "busy" slots
    const slots = entries.filter(isSlot);
    expect(slots).toHaveLength(2);
    slots.forEach((slot) => {
      expect(slot).toHaveProperty('id');
      expect(slot).toMatchObject({
        status: 'busy',
        start,
        end,
      });
    });

    // The appointment holds references to the created slots
    expect(appointments[0].slot).toHaveLength(2);
    expect(appointments[0].slot?.map((slot) => slot.reference)).toEqual(
      expect.arrayContaining(slots.map((slot) => `Slot/${slot.id}`))
    );
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [
                { actor: schedule1.actor[0], status: 'tentative' },
                { actor: schedule2.actor[0], status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start: '2026-01-15T08:00:00Z',
                  end: '2026-01-15T09:00:00Z',
                } satisfies Slot,
              ],
            } satisfies Appointment,
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
        expression: ['Parameters.appointment.contained[0].start', 'Parameters.appointment.contained[1].start'],
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [
                { actor: schedule1.actor[0], status: 'tentative' },
                { actor: schedule2.actor[0], status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T14:30:00Z',
                } satisfies Slot,
              ],
            } satisfies Appointment,
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
        expression: ['Parameters.appointment.contained[0].end', 'Parameters.appointment.contained[1].end'],
      },
    ]);
    expect(response.status).toEqual(400);
  });

  test('fails when there is an overlapping busy slot booked', async () => {
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.status).toEqual(400);

    // Check no appointment was created
    const appointments = await systemRepo.searchResources<Appointment>(
      parseSearchRequest(`Appointment?practitioner=Practitioner/${practitioner.id}`)
    );
    expect(appointments).toHaveLength(0);

    // Check no additional slot was created
    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots).toHaveLength(1);
  });

  test('fails without a HealthcareService reference embedded in serviceType', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              serviceType: [{ coding: [{ code: 'other' }] }],
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: 'Appointment has no service reference' },
        },
      ],
    });
    expect(response.status).toEqual(400);
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: 'Requested time slot is not available' },
        },
      ],
    });
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [
                { actor: schedule1.actor[0], status: 'tentative' },
                { actor: schedule2.actor[0], status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start,
                  end,
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    if (succeeds) {
      expect(response.body).not.toHaveProperty('issue');
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T14:30:00Z',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T14:30:00Z',
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        details: {
          text: 'Slot duration does not match scheduling parameters duration',
        },
        expression: ['Parameters.appointment.contained[0]'],
        severity: 'error',
      },
    ]);
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
              name: 'appointment',
              resource: {
                resourceType: 'Appointment',
                status: 'proposed',
                start,
                end,
                serviceType: toCodeableReferenceLike(officeVisitService),
                participant: [{ actor: schedule.actor[0], status: 'tentative' }],
                contained: [
                  {
                    resourceType: 'Slot',
                    status: 'busy',
                    schedule: createReference(schedule),
                    start,
                    end,
                  } satisfies Slot,
                ],
              } satisfies Appointment,
            },
          ],
        });
      expect(response.body).not.toHaveProperty('issue');
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

    // Trying to book at the front of the availability window fails because the
    // 20-min bufferBefore slot falls outside the window (08:40-09:00 ET)
    const response1 = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T09:00:00-05:00',
              end: '2026-01-15T10:00:00-05:00',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T09:00:00-05:00',
                  end: '2026-01-15T10:00:00-05:00',
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy-unavailable',
                  schedule: createReference(schedule),
                  start: '2026-01-15T08:40:00.000-05:00',
                  end: '2026-01-15T09:00:00.000-05:00',
                } satisfies Slot,
              ],
            } satisfies Appointment,
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T10:00:00-05:00',
              end: '2026-01-15T11:00:00-05:00',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T10:00:00-05:00',
                  end: '2026-01-15T11:00:00-05:00',
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy-unavailable',
                  schedule: createReference(schedule),
                  start: '2026-01-15T09:40:00.000-05:00',
                  end: '2026-01-15T10:00:00.000-05:00',
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });
    expect(response2.body).not.toHaveProperty('issue');
    expect(response2.status).toEqual(201);

    // It creates a bufferBefore slot with status: 'busy-unavailable'
    const entries = ((response2.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);
    const bufferSlots = entries.filter(isSlot).filter((slot) => slot.status === 'busy-unavailable');
    expect(bufferSlots).toHaveLength(1);
    expect(bufferSlots).toMatchObject([
      {
        resourceType: 'Slot',
        start: '2026-01-15T09:40:00.000-05:00',
        end: '2026-01-15T10:00:00.000-05:00',
        schedule: createReference(schedule),
        status: 'busy-unavailable',
      },
    ]);
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

    // Trying to book at the end of the availability window fails because the
    // 20-min bufferAfter slot falls outside the window (17:00-17:20 ET)
    const response1 = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T16:30:00-05:00',
              end: '2026-01-15T17:00:00-05:00',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T16:30:00-05:00',
                  end: '2026-01-15T17:00:00-05:00',
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy-unavailable',
                  schedule: createReference(schedule),
                  start: '2026-01-15T17:00:00.000-05:00',
                  end: '2026-01-15T17:20:00.000-05:00',
                } satisfies Slot,
              ],
            } satisfies Appointment,
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: '2026-01-15T16:00:00-05:00',
              end: '2026-01-15T16:30:00-05:00',
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T16:00:00-05:00',
                  end: '2026-01-15T16:30:00-05:00',
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy-unavailable',
                  schedule: createReference(schedule),
                  start: '2026-01-15T16:30:00.000-05:00',
                  end: '2026-01-15T16:50:00.000-05:00',
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });
    expect(response2.body).not.toHaveProperty('issue');
    expect(response2.status).toEqual(201);

    // It creates a bufferAfter slot with status: 'busy-unavailable'
    const entries = ((response2.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);
    const bufferSlots = entries.filter(isSlot).filter((slot) => slot.status === 'busy-unavailable');
    expect(bufferSlots).toHaveLength(1);
    expect(bufferSlots).toMatchObject([
      {
        resourceType: 'Slot',
        start: '2026-01-15T16:30:00.000-05:00',
        end: '2026-01-15T16:50:00.000-05:00',
        schedule: createReference(schedule),
        status: 'busy-unavailable',
      },
    ]);
  });

  test('patient references embedded in Appointment.participant are preserved', async () => {
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [
                { actor: schedule.actor[0], status: 'tentative' },
                { actor: createReference(patient), status: 'accepted' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
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

  test('errors when the appointment parameter already has the `slot` attribute', async () => {
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
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              slot: [{ reference: 'Slot/already-set' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: 'Proposed appointment must not have Slot references' } }],
    });
  });

  test('rejects when the proposed slot start is not aligned to the scheduling grid', async () => {
    const schedule = await makeSchedule({
      actor: practitioner1,
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            threeDayAvailability,
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'alignmentInterval', valueDuration: { value: 30, unit: 'min' } },
            { url: 'alignmentOffset', valueDuration: { value: 0, unit: 'min' } },
            { url: 'service', valueReference: createReference(officeVisitService) },
          ],
        },
      ],
    });

    // 14:15Z is not on the 30-minute grid (valid starts are :00 and :30)
    const misalignedStart = '2026-01-15T14:15:00Z';
    const misalignedEnd = '2026-01-15T15:15:00Z';

    const misalignedResponse = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: misalignedStart,
              end: misalignedEnd,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: misalignedStart,
                  end: misalignedEnd,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(misalignedResponse.status).toEqual(400);
    expect(misalignedResponse.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: 'Slot start time is not aligned to the scheduling grid' } }],
    });

    // 14:30Z is on the 30-minute grid
    const alignedStart = '2026-01-15T14:30:00Z';
    const alignedEnd = '2026-01-15T15:30:00Z';

    const alignedResponse = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start: alignedStart,
              end: alignedEnd,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: alignedStart,
                  end: alignedEnd,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(alignedResponse.body).not.toHaveProperty('issue');
    expect(alignedResponse.status).toEqual(201);
  });

  describe('Loading schedulingParameters from HealthcareService', () => {
    async function makeHealthcareService(
      serviceType: CodeableConcept,
      duration: number
    ): Promise<WithId<HealthcareService>> {
      return systemRepo.createResource<HealthcareService>({
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
      const service = await makeHealthcareService(serviceType, 60);
      const schedule = await makeSchedule({ actor: practitioner1, extension: [] });

      const response = await request
        .post('/fhir/R4/Appointment/$book')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'appointment',
              resource: {
                resourceType: 'Appointment',
                status: 'proposed',
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T15:00:00Z',
                serviceType: toCodeableReferenceLike(service),
                participant: [{ actor: schedule.actor[0], status: 'tentative' }],
                contained: [
                  {
                    resourceType: 'Slot',
                    status: 'busy',
                    schedule: createReference(schedule),
                    start: '2026-01-15T14:00:00Z',
                    end: '2026-01-15T15:00:00Z',
                  } satisfies Slot,
                ],
              } satisfies Appointment,
            },
          ],
        });

      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toEqual(201);
    });

    test('fails when booking outside HealthcareService availability', async () => {
      const serviceType = { coding: [{ system: 'http://example.com', code: 'consult' }] };
      const service = await makeHealthcareService(serviceType, 60);
      const schedule = await makeScheduleNoParams(practitioner1);

      // 07:00-08:00 ET is outside the 09:00-17:00 ET window
      const response = await request
        .post('/fhir/R4/Appointment/$book')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'appointment',
              resource: {
                resourceType: 'Appointment',
                status: 'proposed',
                start: '2026-01-15T07:00:00-05:00',
                end: '2026-01-15T08:00:00-05:00',
                serviceType: toCodeableReferenceLike(service),
                participant: [{ actor: schedule.actor[0], status: 'tentative' }],
                contained: [
                  {
                    resourceType: 'Slot',
                    status: 'busy',
                    schedule: createReference(schedule),
                    start: '2026-01-15T07:00:00-05:00',
                    end: '2026-01-15T08:00:00-05:00',
                  } satisfies Slot,
                ],
              } satisfies Appointment,
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
              name: 'appointment',
              resource: {
                resourceType: 'Appointment',
                status: 'proposed',
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T15:00:00Z',
                serviceType: toCodeableReferenceLike(service),
                participant: [{ actor: schedule.actor[0], status: 'tentative' }],
                contained: [
                  {
                    resourceType: 'Slot',
                    status: 'busy',
                    schedule: createReference(schedule),
                    start: '2026-01-15T14:00:00Z',
                    end: '2026-01-15T15:00:00Z',
                  } satisfies Slot,
                ],
              } satisfies Appointment,
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
              name: 'appointment',
              resource: {
                resourceType: 'Appointment',
                status: 'proposed',
                start: '2026-01-15T14:00:00Z',
                end: '2026-01-15T14:30:00Z',
                serviceType: toCodeableReferenceLike(service),
                participant: [{ actor: schedule.actor[0], status: 'tentative' }],
                contained: [
                  {
                    resourceType: 'Slot',
                    status: 'busy',
                    schedule: createReference(schedule),
                    start: '2026-01-15T14:00:00Z',
                    end: '2026-01-15T14:30:00Z',
                  } satisfies Slot,
                ],
              } satisfies Appointment,
            },
          ],
        });
      expect(response30.status).toEqual(400);
      expect(response30.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: 'Slot duration does not match scheduling parameters duration' },
          },
        ],
      });
    });
  });

  test('errors when appointment is after Schedule.planningHorizon.end', async () => {
    const schedule = await makeSchedule({
      actor: practitioner1,
      planningHorizon: { end: '2026-01-14T00:00:00Z' },
    });
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Appointment falls outside schedule planning horizon');
  });

  test('errors when appointment is before Schedule.planningHorizon.start', async () => {
    const schedule = await makeSchedule({
      actor: practitioner1,
      planningHorizon: { start: '2026-01-15T00:00:00Z' },
    });
    const start = '2026-01-14T14:00:00Z';
    const end = '2026-01-14T15:00:00Z';
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: schedule.actor[0], status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Appointment falls outside schedule planning horizon');
  });
});

describe('scheduling flow integration test', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let service: WithId<HealthcareService>;

  const officeVisitConcept: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    // try to be more resilient to concurrent tests touching the same tables
    config.transactionAttempts = 5;
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });
    service = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [officeVisitConcept],
      meta: { project: project.project.id },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('a proposed appointment from Appointment/$find can be used as input to $book', async () => {
    const practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Phoenix' }],
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
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'service', valueReference: createReference(service) },
          ],
        },
      ],
    });

    const findResponse = await request
      .get('/fhir/R4/Appointment/$find')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        start: new Date('2026-01-28T07:00:00.000-07:00').toISOString(),
        end: new Date('2026-01-28T12:00:00.000-07:00').toISOString(),
        'service-type-reference': `HealthcareService/${service.id}`,
        schedule: `Schedule/${schedule.id}`,
      });

    expect(findResponse.body).not.toHaveProperty('issue');
    expect(findResponse.status).toBe(200);
    expect(findResponse.body.entry?.length).toBeGreaterThan(0);

    const proposedAppointment: Appointment = findResponse.body.entry[1].resource;
    expect(proposedAppointment.status).toBe('proposed');

    const bookResponse = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: proposedAppointment }],
      });

    expect(bookResponse.body).not.toHaveProperty('issue');
    expect(bookResponse.status).toBe(201);

    const entries = ((bookResponse.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toHaveProperty('status', 'booked');
    expect(appointments[0]).not.toHaveProperty('contained');
  });

  test('booking a slot as a patient with a minimal access policy', async () => {
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
            {
              url: 'service',
              valueReference: createReference(service),
            },
            {
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
            },
            {
              url: 'duration',
              valueDuration: { value: 60, unit: 'min' },
            },
          ],
        },
      ],
    });

    // When updating this policy, please try to update the sample "Patient Access Policy"
    // in the documentation so that it includes these permissions.
    // @see https://www.medplum.com/docs/access/access-policies#patient-access
    const minimalPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Practitioner',
          interaction: ['read'],
        },
        {
          resourceType: 'HealthcareService',
          interaction: ['read'],
        },
        {
          resourceType: 'Schedule',
          interaction: ['read'],
        },
        {
          resourceType: 'Patient',
          criteria: 'Patient?_compartment=%patient',
          interaction: ['read'],
        },
        {
          resourceType: 'Slot',
          interaction: ['create', 'search'],
        },
        {
          resourceType: 'Appointment',
          interaction: ['create'],
          criteria: 'Appointment?_compartment=%patient',
        },
      ],
    };

    const { accessToken, profile } = await addTestUser(project.project, {
      accessPolicy: minimalPolicy,
      resourceType: 'Patient',
    });

    const start = '2026-01-28T16:00:00Z'; // 09:00 America/Phoenix (UTC-7)
    const end = '2026-01-28T17:00:00Z'; // 10:00 America/Phoenix

    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              start,
              end,
              status: 'proposed',
              serviceType: toCodeableReferenceLike(service),
              participant: [
                { actor: createReference(profile), status: 'accepted' },
                { actor: createReference(practitioner), status: 'accepted' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  schedule: createReference(schedule),
                  start,
                  end,
                  status: 'busy',
                  serviceType: [officeVisitConcept],
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined);

    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toHaveProperty('status', 'booked');
    expect(appointments[0]).toHaveProperty('start', start);
    expect(appointments[0]).toHaveProperty('end', end);
    expect(appointments[0].participant).toContainEqual({
      actor: createReference(profile),
      status: 'accepted',
    });

    const slots = entries.filter(isSlot);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toHaveProperty('status', 'busy');

    // Test that another patient with the same access policy can read the Slot
    // created, and that it has no PHI in it.
    const otherPatient = await addTestUser(project.project, {
      accessPolicy: minimalPolicy,
      resourceType: 'Patient',
    });

    const otherPatientResponse = await request
      .get('/fhir/R4/Slot')
      .query({ schedule: getReferenceString(schedule) })
      .set('Authorization', `Bearer ${otherPatient.accessToken}`)
      .send();

    expect(otherPatientResponse.body).not.toHaveProperty('issue');
    expect(otherPatientResponse.status).toEqual(200);
    expect(otherPatientResponse.body).toHaveProperty('entry');
    expect(otherPatientResponse.body.entry).toHaveLength(1);
    expect(otherPatientResponse.body.entry[0].resource).toEqual({
      resourceType: 'Slot',
      schedule: {
        reference: `Schedule/${schedule.id}`,
      },
      start: '2026-01-28T16:00:00Z',
      end: '2026-01-28T17:00:00Z',
      status: 'busy',
      serviceType: [
        {
          coding: [
            {
              system: 'https://example.com/fhir',
              code: 'office-visit',
            },
          ],
        },
      ],
      id: slots[0].id,
      meta: {
        versionId: slots[0].meta?.versionId,
        lastUpdated: slots[0].meta?.lastUpdated,
      },
    });

    // explicit check against a possible problem: creating the Slot does not
    // set `meta.author` to the creating Patient, which could leak PHI.
    expect(otherPatientResponse.body.entry[0].resource.meta).not.toHaveProperty('author');
  });
});
