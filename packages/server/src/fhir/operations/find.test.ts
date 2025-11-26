// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tz } from '@date-fns/tz';
import { ContentType, createReference } from '@medplum/core';
import type { Bundle, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
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
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSchedule(
    opts: {
      bufferBefore?: number;
      bufferAfter?: number;
      alignmentInterval?: number;
      alignmentOffset?: number;
      duration?: number;
    } = {}
  ): Promise<Schedule> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner)],
      extension: [
        { url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' },
        {
          url: 'http://medplum.com/fhir/StructureDefinition/scheduling-parameters',
          extension: [
            {
              url: 'availability',
              valueTiming: {
                repeat: {
                  dayOfWeek: ['mon', 'tue', 'wed', 'thu'],
                  timeOfDay: ['09:30:00', '13:15:00'],
                  duration: 3,
                  durationUnit: 'h',
                },
              },
            },
            {
              url: 'bufferBefore',
              valueDuration: {
                value: opts.bufferBefore ?? 0,
                unit: 'min',
              },
            },
            {
              url: 'bufferAfter',
              valueDuration: {
                value: opts.bufferAfter ?? 0,
                unit: 'min',
              },
            },
            {
              url: 'alignmentInterval',
              valueDuration: {
                value: opts.alignmentInterval ?? 0,
                unit: 'min',
              },
            },
            {
              url: 'alignmentOffset',
              valueDuration: {
                value: opts.alignmentOffset ?? 0,
                unit: 'min',
              },
            },
            {
              url: 'duration',
              valueDuration: {
                value: opts.duration ?? 20,
                unit: 'min',
              },
            },
          ],
        },
      ],
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
    const schedule = await makeSchedule();
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
    const schedule = await makeSchedule();
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
    const schedule = await makeSchedule();
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
    const schedule = await makeSchedule();
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
    const schedule = await makeSchedule({ bufferBefore: 15, bufferAfter: 5 });

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
    const schedule = await makeSchedule();
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
    const schedule = await makeSchedule();
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
});
