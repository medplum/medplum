// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, isDefined, isResource, parseSearchRequest } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  Device,
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
  return isResource<Appointment>(obj, 'Appointment');
}

function isSlot(obj: Resource): obj is Slot {
  return isResource<Slot>(obj, 'Slot');
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

describe('Appointment/$hold', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner1: WithId<Practitioner>;
  let practitioner2: WithId<Practitioner>;
  let patient: WithId<Patient>;
  let officeVisitService: WithId<HealthcareService>;

  const officeVisit: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });
    patient = await makePatient();
    practitioner1 = await makePractitioner({ timezone: 'America/New_York' });
    practitioner2 = await makePractitioner({ timezone: 'America/New_York' });

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
    bufferBefore?: number;
    bufferAfter?: number;
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
    if (opts?.bufferBefore) {
      extension.extension.push({
        url: 'bufferBefore',
        valueDuration: { value: opts.bufferBefore, unit: 'min' },
      });
    }
    if (opts?.bufferAfter) {
      extension.extension.push({
        url: 'bufferAfter',
        valueDuration: { value: opts.bufferAfter, unit: 'min' },
      });
    }

    return extension;
  }

  async function makeSchedule(opts: {
    actor: WithId<Practitioner | Device>;
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
    const extension: Extension[] = [];
    if (timezone) {
      extension.push({ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: timezone });
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

  // Builds the Parameters body for $hold with a single schedule's slots
  function holdParams(opts: { schedule: WithId<Schedule>; start: string; end: string; extraSlots?: Slot[] }): object {
    return {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'appointment',
          resource: {
            resourceType: 'Appointment',
            status: 'proposed',
            start: opts.start,
            end: opts.end,
            serviceType: toCodeableReferenceLike(officeVisitService),
            participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
            contained: [
              {
                resourceType: 'Slot',
                status: 'busy',
                schedule: createReference(opts.schedule),
                start: opts.start,
                end: opts.end,
                serviceType: toCodeableReferenceLike(officeVisitService),
              } satisfies Slot,
              ...(opts.extraSlots ?? []),
            ],
          } satisfies Appointment,
        },
      ],
    };
  }

  test('succeeds with 201 Created', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start: '2026-01-15T14:00:00Z', end: '2026-01-15T15:00:00Z' }));

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);
  });

  test('creates a "pending" Appointment and "busy-tentative" Slot', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start, end }));

    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);

    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toHaveProperty('id');
    expect(appointments[0]).toHaveProperty('start', start);
    expect(appointments[0]).toHaveProperty('end', end);
    expect(appointments[0]).toHaveProperty('status', 'pending');
    // Hold strips contained resources from the appointment — they should not be persisted
    expect(appointments[0]).not.toHaveProperty('contained');

    // The main slot should be busy-tentative, not busy
    const slots = entries.filter(isSlot);
    const mainSlots = slots.filter((s) => s.status === 'busy-tentative');
    expect(mainSlots).toHaveLength(1);
    expect(mainSlots[0]).toHaveProperty('start', start);
    expect(mainSlots[0]).toHaveProperty('end', end);

    // The Appointment should hold references to created slots
    expect(appointments[0]).toHaveProperty('slot', [createReference(mainSlots[0])]);
  });

  test('with multiple schedules creates one busy-tentative slot per schedule', async () => {
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                { actor: createReference(practitioner1), status: 'tentative' },
                { actor: createReference(practitioner2), status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start,
                  end,
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start,
                  end,
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const tentativeSlots = entries.filter(isSlot).filter((s) => s.status === 'busy-tentative');
    expect(tentativeSlots).toHaveLength(2);
    tentativeSlots.forEach((slot) => {
      expect(slot).toHaveProperty('start', start);
      expect(slot).toHaveProperty('end', end);
    });
  });

  test('rejects when appointment has no service reference', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
              // serviceType has no embedded reference — plain CodeableConcept only
              serviceType: [{ coding: [{ code: 'office-visit' }] }],
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        code: 'invalid',
        severity: 'error',
        details: { text: 'Appointment has no service reference' },
        expression: ['Parameters.appointment.serviceType'],
      }),
    ]);
  });

  test('rejects when appointment serviceType is missing entirely', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({ severity: 'error', details: { text: 'Appointment has no service reference' } }),
    ]);
    expect(response.status).toEqual(400);
  });

  test('rejects when appointment has no contained Slot resources', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
            },
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Appointment has no contained Slot resources' },
      }),
    ]);
    expect(response.status).toEqual(400);
  });

  test('rejects when appointment already has references in `slot`', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: {
              resourceType: 'Appointment',
              slot: [{ reference: 'Slot/abc' }],
              status: 'proposed',
              start,
              end,
              serviceType: toCodeableReferenceLike(officeVisitService),
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            } satisfies Appointment,
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Proposed appointment must not have Slot references' },
      }),
    ]);
    expect(response.status).toEqual(400);
  });

  test('rejects when contained has no Slot resources', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
              contained: [{ resourceType: 'Patient', id: 'inline-patient' }],
            },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Appointment has no contained Slot resources' },
      }),
    ]);
  });

  test('rejects when embedded "busy" slots have mismatched start times', async () => {
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                { actor: createReference(practitioner1), status: 'tentative' },
                { actor: createReference(practitioner2), status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start: '2026-01-15T15:00:00Z',
                  end: '2026-01-15T16:00:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Mismatched slot start times' },
      }),
    ]);
  });

  test('rejects with mismatched busy slot end times', async () => {
    const schedule1 = await makeSchedule({ actor: practitioner1 });
    const schedule2 = await makeSchedule({ actor: practitioner2 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                { actor: createReference(practitioner1), status: 'tentative' },
                { actor: createReference(practitioner2), status: 'tentative' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule1),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule2),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T14:30:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Mismatched slot end times' },
      }),
    ]);
  });

  test('rejects when referenced schedule does not exist', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                  schedule: { reference: 'Schedule/nonexistent-12345' },
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Schedule load failed',
        },
        expression: ['Parameters.appointment.contained[0].schedule'],
      }),
    ]);
    expect(response.status).toEqual(400);
  });

  test('rejects when slot duration does not match scheduling parameters', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 }); // 60-min slots
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
              participant: [{ actor: createReference(practitioner1), status: 'tentative' }],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T14:30:00Z', // 30 min instead of 60
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Slot duration does not match scheduling parameters duration' },
      }),
    ]);
  });

  test('rejects when the slot is outside availability windows', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(
        holdParams({
          schedule,
          // 06:00–07:00 ET is before the 09:00–17:00 window
          start: '2026-01-15T06:00:00-05:00',
          end: '2026-01-15T07:00:00-05:00',
        })
      );

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Requested time slot is not available' },
      }),
    ]);
  });

  test('rejects when a busy slot already exists at the requested time', async () => {
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
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start, end }));

    expect(response.status).toEqual(400);
    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: 'Requested time slot is not available' },
      }),
    ]);

    // Verify no new slots were created
    const slots = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?schedule=Schedule/${schedule.id}`));
    expect(slots).toHaveLength(1); // only the original busy slot
  });

  test('rejects when a busy-tentative slot already exists at the requested time (double hold)', async () => {
    const practitioner = await makePractitioner({ timezone: 'America/New_York' });
    const schedule = await makeSchedule({ actor: practitioner });
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

    // Simulate a prior hold
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      start,
      end,
      status: 'busy-tentative',
      schedule: createReference(schedule),
      meta: { project: project.project.id },
    });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start, end }));

    expect(response.status).toEqual(400);
  });

  test('rejects when there are no embedded "busy" slots for a schedule', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                  status: 'free', // not 'busy' — should fail
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: "Expected exactly one 'busy' slot per schedule" },
      }),
    ]);
    expect(response.status).toEqual(400);
  });

  test('rejects when there are multiple embedded "busy" slots for the same schedule', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.body).toHaveProperty('issue', [
      expect.objectContaining({
        severity: 'error',
        details: { text: "Expected exactly one 'busy' slot per schedule" },
        expression: ['Parameters.appointment.contained[0]', 'Parameters.appointment.contained[1]'],
      }),
    ]);
    expect(response.status).toEqual(400);
  });

  test('with a patient participant preserved in the created appointment', async () => {
    const schedule = await makeSchedule({ actor: practitioner1 });
    const start = '2026-01-15T14:00:00Z';
    const end = '2026-01-15T15:00:00Z';

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
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
                { actor: createReference(practitioner1), status: 'tentative' },
                { actor: createReference(patient), status: 'accepted' },
              ],
              contained: [
                {
                  resourceType: 'Slot',
                  status: 'busy',
                  schedule: createReference(schedule),
                  start,
                  end,
                  serviceType: toCodeableReferenceLike(officeVisitService),
                } satisfies Slot,
              ],
            },
          },
        ],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(201);

    const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].participant).toEqual(
      expect.arrayContaining([expect.objectContaining({ actor: createReference(patient) })])
    );
  });

  describe('with bufferBefore', () => {
    test('succeeds when a correctly-sized bufferBefore slot is included', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferBefore: 20 })],
      });
      const bufferStart = '2026-01-15T09:00:00-05:00';
      const busyStart = '2026-01-15T09:20:00-05:00';
      const busyEnd = '2026-01-15T10:20:00-05:00';

      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(
          holdParams({
            schedule,
            start: busyStart,
            end: busyEnd,
            extraSlots: [
              {
                resourceType: 'Slot',
                status: 'busy-unavailable',
                schedule: createReference(schedule),
                start: bufferStart,
                end: busyStart,
                serviceType: toCodeableReferenceLike(officeVisitService),
              },
            ],
          })
        );

      expect(response.status).toEqual(201);

      const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
      const slots = entries.filter(isSlot);
      const bufferSlots = slots.filter((s) => s.status === 'busy-unavailable');
      expect(bufferSlots).toHaveLength(1);
      expect(bufferSlots[0]).toMatchObject({
        status: 'busy-unavailable',
        schedule: createReference(schedule),
      });
    });

    test('rejects when bufferBefore is not available', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferBefore: 20 })],
      });
      const bufferStart = '2026-01-15T09:00:00-05:00';
      const busyStart = '2026-01-15T09:20:00-05:00';
      const busyEnd = '2026-01-15T10:20:00-05:00';

      // Create an existing slot partially overlapping the requested buffer
      await systemRepo.createResource<Slot>({
        resourceType: 'Slot',
        start: '2026-01-15T08:40:00-05:00',
        end: '2026-01-15T09:10:00-05:00',
        status: 'busy',
        schedule: createReference(schedule),
        meta: { project: project.project.id },
      });

      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(
          holdParams({
            schedule,
            start: busyStart,
            end: busyEnd,
            extraSlots: [
              {
                resourceType: 'Slot',
                status: 'busy-unavailable',
                schedule: createReference(schedule),
                start: bufferStart,
                end: busyStart,
                serviceType: toCodeableReferenceLike(officeVisitService),
              },
            ],
          })
        );

      expect(response.body).toHaveProperty('issue', [
        expect.objectContaining({
          severity: 'error',
          details: { text: 'Requested time slot is not available' },
        }),
      ]);
      expect(response.status).toEqual(400);
    });

    test('rejects when bufferBefore slot is missing', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferBefore: 20 })],
      });

      // No busy-unavailable slot ending at busyStart
      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(holdParams({ schedule, start: '2026-01-15T10:00:00-05:00', end: '2026-01-15T11:00:00-05:00' }));

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('issue', [
        expect.objectContaining({
          severity: 'error',
          details: {
            text: "Expected exactly one 'busy-unavailable' slot ending at the start of the busy slot (bufferBefore)",
          },
        }),
      ]);
    });

    test('rejects when bufferBefore slot has wrong duration', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferBefore: 20 })],
      });
      const busyStart = '2026-01-15T10:00:00-05:00';
      const busyEnd = '2026-01-15T11:00:00-05:00';

      // Buffer is only 10 min, but parameters require 20 min
      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(
          holdParams({
            schedule,
            start: busyStart,
            end: busyEnd,
            extraSlots: [
              {
                resourceType: 'Slot',
                status: 'busy-unavailable',
                schedule: createReference(schedule),
                start: '2026-01-15T09:50:00-05:00', // only 10 min before busyStart
                end: busyStart,
                serviceType: toCodeableReferenceLike(officeVisitService),
              },
            ],
          })
        );

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('issue', [
        expect.objectContaining({
          severity: 'error',
          details: {
            text: expect.stringContaining('does not match scheduling parameters bufferBefore'),
          },
        }),
      ]);
    });
  });

  describe('with bufferAfter', () => {
    test('succeeds when a correctly-sized bufferAfter slot is included', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferAfter: 20 })],
      });
      const busyStart = '2026-01-15T09:00:00-05:00';
      const busyEnd = '2026-01-15T10:00:00-05:00';
      const bufferEnd = '2026-01-15T10:20:00-05:00';

      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(
          holdParams({
            schedule,
            start: busyStart,
            end: busyEnd,
            extraSlots: [
              {
                resourceType: 'Slot',
                status: 'busy-unavailable',
                schedule: createReference(schedule),
                start: busyEnd,
                end: bufferEnd,
                serviceType: toCodeableReferenceLike(officeVisitService),
              },
            ],
          })
        );

      expect(response.status).toEqual(201);

      const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
      const bufferSlots = entries.filter(isSlot).filter((s) => s.status === 'busy-unavailable');
      expect(bufferSlots).toHaveLength(1);
    });

    test('rejects when bufferAfter slot is missing', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferAfter: 20 })],
      });

      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(holdParams({ schedule, start: '2026-01-15T09:00:00-05:00', end: '2026-01-15T10:00:00-05:00' }));

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('issue', [
        expect.objectContaining({
          severity: 'error',
          details: {
            text: "Expected exactly one 'busy-unavailable' slot starting at the end of the busy slot (bufferAfter)",
          },
        }),
      ]);
    });

    test('rejects when bufferAfter slot has wrong duration', async () => {
      const schedule = await makeSchedule({
        actor: practitioner1,
        extension: [makeSchedulingExtension({ service: officeVisitService, duration: 60, bufferAfter: 20 })],
      });

      const busyStart = '2026-01-15T09:00:00-05:00';
      const busyEnd = '2026-01-15T10:00:00-05:00';

      // Buffer is only 10 min, but parameters require 20 min
      const response = await request
        .post('/fhir/R4/Appointment/$hold')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send(
          holdParams({
            schedule,
            start: busyStart,
            end: busyEnd,
            extraSlots: [
              {
                resourceType: 'Slot',
                status: 'busy-unavailable',
                schedule: createReference(schedule),
                start: busyEnd,
                end: '2026-01-15T10:10:00-05:00', // only 10 min, not 20
                serviceType: toCodeableReferenceLike(officeVisitService),
              },
            ],
          })
        );

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('issue', [
        expect.objectContaining({
          severity: 'error',
          details: {
            text: expect.stringContaining('does not match scheduling parameters bufferAfter'),
          },
        }),
      ]);
    });
  });

  test('fails when the schedule has more than one actor', async () => {
    const extraPractitioner = await makePractitioner({ timezone: 'America/New_York' });
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner1), createReference(extraPractitioner)],
      serviceType: toCodeableReferenceLike(officeVisitService),
      extension: [makeSchedulingExtension({ service: officeVisitService })],
    });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start: '2026-01-15T14:00:00Z', end: '2026-01-15T15:00:00Z' }));

    expect(response.status).toEqual(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: 'Scheduling only supported on schedules with exactly one actor' } }],
    });
  });

  test('fails when the schedule actor has no timezone', async () => {
    const practitionerWithoutTz = await makePractitioner(); // no timezone extension
    const schedule = await makeSchedule({ actor: practitionerWithoutTz });

    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start: '2026-01-15T14:00:00Z', end: '2026-01-15T15:00:00Z' }));

    expect(response.status).toEqual(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: 'No timezone specified' } }],
    });
  });

  test('errors when appointment is outside schedule planning horizon', async () => {
    const schedule = await makeSchedule({
      actor: practitioner1,
      planningHorizon: { end: '2026-01-14T00:00:00Z' },
    });
    const response = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send(holdParams({ schedule, start: '2026-01-15T14:00:00Z', end: '2026-01-15T15:00:00Z' }));
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Appointment falls outside schedule planning horizon');
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

  test('a Slot from Appointment/$find can be used as input to Appointment/$hold', async () => {
    const service = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [officeVisit],
      meta: { project: project.project.id },
    });

    const device = await systemRepo.createResource<Device>({
      resourceType: 'Device',
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
      actor: [createReference(device)],
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
      .get(`/fhir/R4/Appointment/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        start: new Date('2026-01-28T07:00:00.000-07:00'),
        end: new Date('2026-01-28T12:00:00.000-07:00'),
        'service-type-reference': `HealthcareService/${service.id}`,
        schedule: `Schedule/${schedule.id}`,
      });

    expect(findResponse.body).not.toHaveProperty('issue');
    expect(findResponse.status).toBe(200);
    expect(findResponse.body).toHaveProperty('entry');
    expect(findResponse.body.entry).toHaveLength(4);
    const proposedAppointment: Appointment = findResponse.body.entry[1].resource;

    const bookResponse = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment',
            resource: proposedAppointment,
          },
        ],
      });

    expect(bookResponse.body).not.toHaveProperty('issue');
    expect(bookResponse.status).toBe(201);
  });
});
