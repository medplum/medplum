// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type {
  Bundle,
  CodeableConcept,
  Extension,
  HealthcareService,
  Location,
  Practitioner,
  Project,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { SystemRepository } from '../../fhir/repo';
import { createTestProject } from '../../test.setup';
import { ServiceTypeReferenceURI, toCodeableReferenceLike } from '../../util/servicetype';
import type { SchedulingParametersExtensionExtension } from './utils/scheduling-parameters';

const app = express();
const request = supertest(app);

type AvailabilityOptions = {
  service: WithId<HealthcareService>;
  bufferBefore?: number;
  bufferAfter?: number;
  alignmentInterval?: number;
  alignmentOffset?: number;
  duration?: number;
  availability: SchedulingParametersExtensionExtension;
  timezone?: string;
};

const fourDayWorkWeek = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '09:30:00' },
        { url: 'availableEndTime', valueTime: '12:30:00' },
      ],
    },
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '13:15:00' },
        { url: 'availableEndTime', valueTime: '16:15:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const twoDaySchedule = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'daysOfWeek', valueCode: 'fri' },
        { url: 'availableStartTime', valueTime: '12:00:00' },
        { url: 'availableEndTime', valueTime: '20:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const fridayOnly = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'fri' },
        { url: 'availableStartTime', valueTime: '10:30:00' },
        { url: 'availableEndTime', valueTime: '18:30:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

describe('Schedule/:id/$find', () => {
  let location: Location;
  let practitioner: Practitioner;
  let officeVisit: WithId<HealthcareService>;
  let genericVisit: WithId<HealthcareService>;
  let project: WithId<Project>;
  let accessToken: string;
  let systemRepo: SystemRepository;

  const servicesMap: Record<string, HealthcareService> = {};

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const projectResult = await createTestProject({ withAccessToken: true, withRepo: true });
    project = projectResult.project;
    accessToken = projectResult.accessToken;
    systemRepo = projectResult.repo.getSystemRepo();

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    location = await systemRepo.createResource<Location>({
      resourceType: 'Location',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Phoenix' }],
    });
    genericVisit = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      type: [{ coding: [{ system: 'http://example.com', code: 'generic-visit' }] }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'duration',
              valueDuration: { value: 20, unit: 'min' },
            },
          ],
        },
      ],
      name: 'Visit',
    });
    officeVisit = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      type: [{ coding: [{ code: 'office-visit' }] }],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'duration',
              valueDuration: { value: 20, unit: 'min' },
            },
          ],
        },
      ],
      name: 'Office Visit',
    });

    servicesMap[genericVisit.id] = genericVisit;
    servicesMap[officeVisit.id] = officeVisit;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function makeSchedulingExtension(availability: AvailabilityOptions[]): Extension[] {
    return availability.map((options) => {
      const { availability, timezone, service, ...durations } = options;

      const extension = {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [] as Extension[],
      } satisfies Extension;

      if (availability) {
        extension.extension.push(availability);
      }

      if (timezone) {
        extension.extension.push({
          url: 'timezone',
          valueCode: timezone,
        });
      }

      extension.extension.push({
        url: 'service',
        valueReference: createReference(service),
      });

      Object.entries(durations).forEach(([key, value]) =>
        extension.extension.push({ url: key, valueDuration: { value, unit: 'min' } })
      );

      return extension;
    });
  }

  async function makeSchedule(
    availability: AvailabilityOptions[],
    opts?: { actor?: Schedule['actor'] }
  ): Promise<Schedule> {
    const serviceType = availability.flatMap((entry) => toCodeableReferenceLike(entry.service));
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: opts?.actor ?? [createReference(practitioner)],
      extension: makeSchedulingExtension(availability),
      serviceType,
    });
  }

  async function makeSlot(params: {
    start: Date;
    end: Date;
    status: 'busy' | 'free' | 'busy-unavailable';
    schedule: Schedule;
    serviceType?: CodeableConcept[];
  }): Promise<Slot> {
    return systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      status: params.status,
      schedule: createReference(params.schedule),
      serviceType: params.serviceType,
    });
  }

  test('searching an interval not overlapping availability returns an empty bundle', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 20 }]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00'),
        end: new Date('2025-12-01T09:00:00.000-05:00'),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
    });
    expect(response.body).not.toHaveProperty('entry');
  });

  test('finds slots that overlap with the availability in the range', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 20 }]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00'),
        end: new Date('2025-12-01T14:00:00.000-05:00'),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('discovers and removes busy slots from the search results', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 20 }]);
    await makeSlot({
      start: new Date('2025-12-01T11:10:00.000-05:00'),
      end: new Date('2025-12-01T11:40:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // 11:10 - 11:40 is busy, so the 11:00-11:20 slot is not returned here
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('discovers and adds "free" slots into the search results', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 20 }]);

    // Free slots with no service type can be used for any service type
    await makeSlot({
      start: new Date('2025-12-01T09:00:00.000-05:00'),
      end: new Date('2025-12-01T10:00:00.000-05:00'),
      status: 'free',
      schedule,
    });

    // Free slots with a service type that matches the service type from the scheduling
    // parameters used can be chosen
    await makeSlot({
      start: new Date('2025-12-01T13:00:00.000-05:00'),
      end: new Date('2025-12-01T14:00:00.000-05:00'),
      status: 'free',
      schedule,
      serviceType: genericVisit.type,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T09:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T09:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T13:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T13:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ system: 'http://example.com', code: 'generic-visit' }] }],
          },
        },
      ],
    });
  });

  test('resolving availability with bufferBefore and bufferAfter', async () => {
    const schedule = await makeSchedule([
      {
        service: genericVisit,
        availability: fourDayWorkWeek,
        bufferBefore: 15,
        bufferAfter: 5,
        duration: 20,
      },
    ]);

    // Mark busy directly after the 12:00 slot, blocking it
    await makeSlot({
      start: new Date('2025-12-01T12:20:00.000-05:00'),
      end: new Date('2025-12-01T12:40:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    // Mark busy 5min after the 11am slot, leaving bufferAfter free
    await makeSlot({
      start: new Date('2025-12-01T11:25:00.000-05:00'),
      end: new Date('2025-12-01T11:45:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    // Mark busy 10min before the 10am slot, blocking it
    await makeSlot({
      start: new Date('2025-12-01T09:20:00.000-05:00'),
      end: new Date('2025-12-01T09:50:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        // 9:20 - 9:50 is busy, so the 10:00-10:20 slot is not returned here (it would not have the 15min buffer before)
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // 12:20 - 12:40 is busy, so the 12:00-12:20 slot is not returned here (it would not have the 5min buffer after)
      ],
    });
  });

  test('search input in another timezone finds appropriate overlap', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 20 }]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('uses default search page size of 20 results', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 60 }]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body.entry).toHaveLength(20);
  });

  test('can override search page size with `_count`', async () => {
    const schedule = await makeSchedule([
      {
        service: genericVisit,
        // Alignment slot options to every-two-minutes means that there are
        // lots of results so we can test the maximum page size of 1000
        alignmentInterval: 2,
        availability: fourDayWorkWeek,
        duration: 60,
      },
    ]);
    const smallResponse = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 10,
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(smallResponse.body).not.toHaveProperty('issue');
    expect(smallResponse.status).toBe(200);
    expect(smallResponse.body.entry).toHaveLength(10);

    const largeResponse = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 1000,
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(largeResponse.body).not.toHaveProperty('issue');
    expect(largeResponse.status).toBe(200);
    expect(largeResponse.body.entry).toHaveLength(1000);
  });

  test('errors if _count is too low', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 60 }]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 0,
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.status).toBe(400);
    expect(response.body.issue).toEqual([
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Invalid _count, minimum required is 1',
        },
      },
    ]);
  });

  test('errors if _count is too high', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 60 }]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 1001,
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.status).toBe(400);
    expect(response.body.issue).toEqual([
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Invalid _count, maximum allowed is 1000',
        },
      },
    ]);
  });

  test("gets timezone data from the schedule's actor", async () => {
    // `location` has timezone set to America/Phoenix, which is always at offset -07:00
    const schedule = await makeSchedule([{ service: genericVisit, availability: fourDayWorkWeek, duration: 20 }], {
      actor: [createReference(location)],
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-07:00').toISOString(),
        end: new Date('2025-12-01T12:00:00.000-07:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-07:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-07:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-07:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-07:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test("timezone in scheduling parameters overrides the schedule's actor's timezone", async () => {
    // `location` has timezone set to America/Phoenix, which is always at offset -07:00
    // scheduling params have timezone set to Pacific/Honolulu, which is always at offset -10:00
    const schedule = await makeSchedule(
      [{ service: genericVisit, availability: fourDayWorkWeek, duration: 20, timezone: 'Pacific/Honolulu' }],
      { actor: [createReference(location)] }
    );
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-10:00').toISOString(),
        end: new Date('2025-12-01T12:00:00.000-10:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-10:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-10:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-10:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-10:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('without a service-type parameter', async () => {
    const schedule = await makeSchedule([]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-04T10:00:00.000-05:00'),
        end: new Date('2025-12-04T14:00:00.000-05:00'),
      });
    expect(response.body).toHaveProperty('issue');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          code: 'invalid',
          severity: 'error',
          details: {
            text: "Expected at least 1 value(s) for required input parameter 'service-type-reference'",
          },
        },
      ],
    });
  });

  describe('Loading schedulingParameters from HealthcareServices', () => {
    test('works when scheduling parameters only exist on a HealthcareService', async () => {
      const bloodDonation: CodeableConcept = {
        coding: [{ system: 'http://example.com', code: 'blood-donation' }],
      };

      const service = await systemRepo.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        name: 'Blood Donation',
        meta: { project: project.id },
        active: true,
        type: [bloodDonation],
        availableTime: [
          {
            daysOfWeek: ['thu', 'fri'],
            availableStartTime: '12:00:00',
            availableEndTime: '20:00:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }],
          },
        ],
      });

      const schedule = await systemRepo.createResource<Schedule>({
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        serviceType: toCodeableReferenceLike(service),
      });

      const response = await request
        .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .query({
          start: new Date('2025-12-04T10:00:00.000-05:00'),
          end: new Date('2025-12-04T14:00:00.000-05:00'),
          'service-type-reference': `HealthcareService/${service.id}`,
        });
      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toBe(200);

      expect(response.body).toMatchObject<Bundle>({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T12:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T12:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [bloodDonation],
            },
          },
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T13:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T13:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [bloodDonation],
            },
          },
        ],
      });
    });

    test('schedule-specific parameters override those on the HealthcareService', async () => {
      const concept = { coding: [{ system: 'http://example.com', code: 'yoga' }] };
      const service = await systemRepo.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        meta: { project: project.id },
        type: [concept],
        availableTime: [
          {
            daysOfWeek: ['mon', 'tue', 'wed', 'thu'],
            availableStartTime: '09:30:00',
            availableEndTime: '12:30:00',
          },
          {
            daysOfWeek: ['mon', 'tue', 'wed', 'thu'],
            availableStartTime: '13:15:00',
            availableEndTime: '16:15:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { value: 20, unit: 'min' } }],
          },
        ],
      });

      const schedule = await systemRepo.createResource<Schedule>({
        resourceType: 'Schedule',
        meta: { project: project.id },
        actor: [createReference(practitioner)],
        serviceType: toCodeableReferenceLike(service),
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [
              twoDaySchedule,
              { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
              { url: 'service', valueReference: createReference(service) },
            ],
          },
        ],
      });

      const response = await request
        .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .query({
          start: new Date('2025-12-04T10:00:00.000-05:00'),
          end: new Date('2025-12-04T14:00:00.000-05:00'),
          'service-type-reference': `HealthcareService/${service.id}`,
        });
      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject<Bundle>({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T12:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T12:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [concept],
            },
          },
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T13:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T13:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [concept],
            },
          },
        ],
      });
    });
  });

  test('when the healthcare service is not found', async () => {
    const schedule = await makeSchedule([
      { service: genericVisit, availability: fridayOnly, duration: 45, bufferBefore: 15 },
      { service: officeVisit, availability: twoDaySchedule, duration: 30, alignmentOffset: 15, alignmentInterval: 30 },
    ]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-04T10:00:00.000-05:00'),
        end: new Date('2025-12-04T14:00:00.000-05:00'),
        'service-type-reference': 'HealthcareService/12345',
      });
    expect(response.body).toHaveProperty('issue');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          code: 'invalid',
          severity: 'error',
          details: {
            text: 'HealthcareService not found',
          },
        },
      ],
    });
  });

  test(`when the HealthcareService.type  does not match Schedule.serviceType`, async () => {
    const schedule = await makeSchedule([
      { service: genericVisit, availability: fridayOnly, duration: 45, bufferBefore: 15 },
    ]);
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-04T10:00:00.000-05:00'),
        end: new Date('2025-12-04T14:00:00.000-05:00'),
        'service-type-reference': `HealthcareService/${officeVisit.id}`,
      });
    expect(response.body).toHaveProperty('issue');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          code: 'invalid',
          severity: 'error',
          details: {
            text: 'Schedule is not scheduleable for requested service type',
          },
        },
      ],
    });
  });

  test('when serviceType has no codes', async () => {
    // create a HealthcareService with no `type` attribute
    const emptyService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      meta: { project: project.id },
      name: 'Empty Service',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            {
              url: 'duration',
              valueDuration: { value: 20, unit: 'min' },
            },
          ],
        },
      ],
    });

    // Link a schedule to it
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      serviceType: [
        {
          extension: [
            {
              url: ServiceTypeReferenceURI,
              valueReference: createReference(emptyService),
            },
          ],
        },
      ],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            twoDaySchedule,
            { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
            { url: 'service', valueReference: createReference(emptyService) },
          ],
        },
      ],
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-05T10:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-05T14:00:00.000-05:00').toISOString(),
        'service-type-reference': `HealthcareService/${emptyService.id}`,
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('entry');
    expect(response.body.entry).toHaveLength(2);
  });

  test('POST with a Parameters body returns the same results as GET', async () => {
    const schedule = await makeSchedule([{ service: genericVisit, duration: 30, availability: twoDaySchedule }]);

    const getResponse = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
        end: new Date('2026-03-17T00:00:00-04:00').toISOString(),
        'service-type-reference': `HealthcareService/${genericVisit.id}`,
        schedule: `Schedule/${schedule.id}`,
      });

    const postResponse = await request
      .post(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'start', valueDateTime: new Date('2026-03-16T00:00:00-04:00').toISOString() },
          { name: 'end', valueDateTime: new Date('2026-03-17T00:00:00-04:00').toISOString() },
          { name: 'service-type-reference', valueReference: { reference: `HealthcareService/${genericVisit.id}` } },
          { name: 'schedule', valueReference: { reference: `Schedule/${schedule.id}` } },
        ],
      });

    expect(postResponse.body).not.toHaveProperty('issue');
    expect(postResponse.status).toBe(200);

    const getStarts = (getResponse.body as Bundle<Slot>).entry?.map((e) => e.resource?.start);
    const postStarts = (postResponse.body as Bundle<Slot>).entry?.map((e) => e.resource?.start);
    expect(postStarts).toEqual(getStarts);
  });
});
