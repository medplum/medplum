// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tz } from '@date-fns/tz';
import { ContentType, createReference } from '@medplum/core';
import type { Bundle, Extension, Practitioner, Schedule, Slot, Timing } from '@medplum/fhirtypes';
import { formatRFC3339 } from 'date-fns';
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
const nytz = tz('America/New_York');
const latz = tz('America/Los_Angeles');
const formatNY = (date: Date): string => formatRFC3339(date, { in: nytz, fractionDigits: 3 });
const formatLA = (date: Date): string => formatRFC3339(date, { in: latz, fractionDigits: 3 });

// indicator that availability should be created without specific service-type matching
const wildcard = '__WILDCARD__';

type AvailabilityOptions = {
  bufferBefore?: number;
  bufferAfter?: number;
  alignmentInterval?: number;
  alignmentOffset?: number;
  duration?: number;
  availability: Timing['repeat'];
};

const fourDayWorkWeek: Timing['repeat'] = {
  dayOfWeek: ['mon', 'tue', 'wed', 'thu'],
  timeOfDay: ['09:30:00', '13:15:00'],
  duration: 3,
  durationUnit: 'h',
};

const twoDaySchedule: Timing['repeat'] = {
  dayOfWeek: ['thu', 'fri'],
  timeOfDay: ['12:00:00'],
  duration: 8,
  durationUnit: 'h',
};

const fridayOnly: Timing['repeat'] = {
  dayOfWeek: ['fri'],
  timeOfDay: ['10:30:00'],
  duration: 8,
  durationUnit: 'h',
};

describe('Schedule/:id/$find', () => {
  let practitioner: Practitioner;
  let project: TestProjectResult<{ withAccessToken: true }>;

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

  async function makeSchedule(availability: Record<string, AvailabilityOptions>): Promise<Schedule> {
    const extension = Object.entries(availability).map(([serviceType, options]) => {
      const { availability, ...durations } = options;

      const extension = {
        url: 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters',
        extension: [
          {
            url: 'availability',
            valueTiming: { repeat: availability },
          },
        ] as Extension[],
      } satisfies Extension;

      if (serviceType !== wildcard) {
        extension.extension.push({
          url: 'serviceType',
          valueCoding: { code: serviceType, system: 'http://example.com' },
        });
      }

      Object.entries(durations).forEach(([key, value]) =>
        extension.extension.push({ url: key, valueDuration: { value, unit: 'min' } })
      );

      return extension;
    });

    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner)],
      extension,
    });
  }

  async function makeSlot(params: {
    start: Date;
    end: Date;
    status: 'busy' | 'free' | 'busy-unavailable';
    schedule: Schedule;
  }): Promise<Slot> {
    return systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.project.id },
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      status: params.status,
      schedule: createReference(params.schedule),
    });
  }

  test('searching an interval not overlapping availability returns an empty bundle', async () => {
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        start: formatNY(new Date('2025-12-01T00:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-01T09:00:00.000-05:00')),
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
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query({
        start: formatNY(new Date('2025-12-01T00:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-01T14:00:00.000-05:00')),
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
            start: formatNY(new Date('2025-12-01T10:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T10:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T11:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T11:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T12:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T12:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('discovers and removes busy slots from the search results', async () => {
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
    });
    await makeSlot({
      start: new Date('2025-12-01T11:10:00.000-05:00'),
      end: new Date('2025-12-01T11:40:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-01T00:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-01T14:00:00.000-05:00')),
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
            start: formatNY(new Date('2025-12-01T10:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T10:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // 11:10 - 11:40 is busy, so the 11:00-11:20 slot is not returned here
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T12:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T12:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('discovers and adds "free" slots into the search results', async () => {
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
    });
    await makeSlot({
      start: new Date('2025-12-01T09:00:00.000-05:00'),
      end: new Date('2025-12-01T10:00:00.000-05:00'),
      status: 'free',
      schedule,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-01T00:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-01T14:00:00.000-05:00')),
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
            start: formatNY(new Date('2025-12-01T09:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T09:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T10:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T10:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T11:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T11:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T12:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T12:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('resolving availability with bufferBefore and bufferAfter', async () => {
    const schedule = await makeSchedule({
      [wildcard]: {
        availability: fourDayWorkWeek,
        bufferBefore: 15,
        bufferAfter: 5,
        duration: 20,
      },
    });

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
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-01T00:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-01T14:00:00.000-05:00')),
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
            start: formatNY(new Date('2025-12-01T11:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T11:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // 12:20 - 12:40 is busy, so the 12:00-12:20 slot is not returned here (it would not have the 5min buffer after)
      ],
    });
  });

  test('search input in another timezone finds appropriate overlap', async () => {
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatLA(new Date('2025-12-01T11:00:00.000-05:00')),
        end: formatLA(new Date('2025-12-01T14:00:00.000-05:00')),
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
            start: formatNY(new Date('2025-12-01T11:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T11:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-01T12:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-01T12:20:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('uses default search page size of 20 results', async () => {
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 60 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-01T00:00:00.000-05:00')),
        end: formatNY(new Date('2026-01-01T00:00:00.000-05:00')),
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body.entry).toHaveLength(20);
  });

  test('with a service-type parameter', async () => {
    const schedule = await makeSchedule({
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
      'new-patient': { availability: twoDaySchedule, duration: 30 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-04T10:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-04T14:00:00.000-05:00')),
        'service-type': 'http://example.com|new-patient,http://example.com|other',
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
            start: formatNY(new Date('2025-12-04T12:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-04T12:30:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-04T13:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-04T13:30:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },
      ],
    });
  });

  test('when no matching serviceType is found, uses any wildcard availability', async () => {
    const schedule = await makeSchedule({
      'new-patient': { availability: fridayOnly, duration: 45, bufferBefore: 15 },
      'office-visit': { availability: twoDaySchedule, duration: 30, alignmentOffset: 15, alignmentInterval: 30 },
      [wildcard]: { availability: fourDayWorkWeek, duration: 20, alignmentOffset: 30 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-04T10:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-04T14:00:00.000-05:00')),
        'service-type': 'http://example.com|new-patient-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        // wildcard slots are 20 minutes long, start on the half-hour, and have no `serviceType` attribute
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-04T10:30:00.000-05:00')),
            end: formatNY(new Date('2025-12-04T10:50:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-04T11:30:00.000-05:00')),
            end: formatNY(new Date('2025-12-04T11:50:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // No entry at 12:30; there is a lunch gap in the scheduled availability
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-04T13:30:00.000-05:00')),
            end: formatNY(new Date('2025-12-04T13:50:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('returns appropriate slots for each serviceType passed', async () => {
    const schedule = await makeSchedule({
      'new-patient': { availability: fridayOnly, duration: 45, bufferBefore: 15 },
      'office-visit': { availability: twoDaySchedule, duration: 30, alignmentOffset: 15, alignmentInterval: 30 },
      [wildcard]: { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: formatNY(new Date('2025-12-05T10:00:00.000-05:00')),
        end: formatNY(new Date('2025-12-05T14:00:00.000-05:00')),
        'service-type': 'http://example.com|new-patient,http://example.com|office-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        // new-patient slots are 45 minutes long and start on the hour
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-05T11:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-05T11:45:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-05T12:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-05T12:45:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-05T13:00:00.000-05:00')),
            end: formatNY(new Date('2025-12-05T13:45:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },

        // office-visit slots are 30 minutes long and start at X:15 or X:45
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-05T12:15:00.000-05:00')),
            end: formatNY(new Date('2025-12-05T12:45:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'office-visit', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-05T12:45:00.000-05:00')),
            end: formatNY(new Date('2025-12-05T13:15:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'office-visit', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: formatNY(new Date('2025-12-05T13:15:00.000-05:00')),
            end: formatNY(new Date('2025-12-05T13:45:00.000-05:00')),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'office-visit', system: 'http://example.com' }] }],
          },
        },

        // no wildcard slots returned because we had exact matches
      ],
    });
  });
});
