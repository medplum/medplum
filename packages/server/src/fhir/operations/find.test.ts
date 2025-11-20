// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, Schedule, Slot } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

// Use fixed date for consistency
const FIXED_DATE = new Date('2025-10-28T12:00:00Z');
const TEST_START = '2025-10-28T00:00:00Z';
const TEST_END = '2025-10-31T23:59:59Z';

describe('Find Operation', () => {
  // Track created resources for cleanup
  const createdResources: Array<{ resourceType: string; id: string }> = [];

  beforeAll(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_DATE);

    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    // Clean up created resources
    const ctx = getAuthenticatedContext();
    for (const resource of createdResources.reverse()) {
      try {
        await ctx.repo.deleteResource(resource.resourceType as any, resource.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    createdResources.length = 0;

    jest.useRealTimers();
    await shutdownApp();
  });

  beforeEach(() => {
    // Clear created resources at start of each test for isolation
    createdResources.length = 0;
  });

  // Cycle 1.1: Basic Request Parsing
  describe('Cycle 1.1: Basic Request Parsing', () => {
    test('Parse input parameters from GET request', async () => {
      const schedule = 'Schedule/test-schedule';

      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=${schedule}`)
        .set('Authorization', 'Bearer ' + accessToken);

      // For now, we expect an error since schedule doesn't exist, but parameters should be parsed
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(404);
    });

    test('Parse input parameters from POST request', async () => {
      const res = await request(app)
        .post(`/fhir/R4/Slot/$find`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'start', valueDateTime: TEST_START },
            { name: 'end', valueDateTime: TEST_END },
            { name: 'schedule', valueString: 'Schedule/test-schedule' },
          ],
        });

      // Parameters should be parsed (error is expected since schedule doesn't exist)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(404);
    });

    test('Reject request without required parameters', async () => {
      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      expect(res.body.issue?.[0]?.details?.text).toContain('end');
    });

    test('Reject request with invalid date format', async () => {
      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=invalid-date&end=${TEST_END}&schedule=Schedule/test`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      expect(res.body.issue?.[0]?.details?.text).toMatch(/Invalid date format|dateTime/i);
    });

    test('Reject request when end date is before start date', async () => {
      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_END}&end=${TEST_START}&schedule=Schedule/test`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      expect(res.body.issue?.[0]?.details?.text).toContain('End date must be after start date');
    });

    test('Handle multiple schedules (array input)', async () => {
      // Create two schedules
      const schedule1Res = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [{ reference: 'Practitioner/test1' }],
        });
      expect(schedule1Res.status).toBe(201);
      const schedule1 = schedule1Res.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule1.id! });

      const schedule2Res = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [{ reference: 'Practitioner/test2' }],
        });
      expect(schedule2Res.status).toBe(201);
      const schedule2 = schedule2Res.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule2.id! });

      // Test with multiple schedules
      const res = await request(app)
        .get(
          `/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/${schedule1.id}&schedule=Schedule/${schedule2.id}`
        )
        .set('Authorization', 'Bearer ' + accessToken);

      // Should succeed (empty bundle if no slots)
      expect(res.status).toBe(200);
      const bundle = res.body as Bundle;
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
    });
  });

  // Cycle 1.2: Schedule Validation
  describe('Cycle 1.2: Schedule Validation', () => {
    test('Validate schedule reference exists and is active', async () => {
      // Create a Schedule
      const scheduleRes = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [{ reference: 'Practitioner/test' }],
        });
      expect(scheduleRes.status).toBe(201);
      const schedule = scheduleRes.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule.id! });

      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/${schedule.id}`)
        .set('Authorization', 'Bearer ' + accessToken);

      // Should succeed (empty bundle if no slots)
      expect(res.status).toBe(200);
      expect(res.status).not.toBe(404);
    });

    test('Return error for invalid/missing schedule', async () => {
      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/nonexistent`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      expect(res.body.issue?.[0]?.details?.text).toContain('Schedule not found');
    });

    test('Return error for inactive schedule (active=false)', async () => {
      // Create an inactive Schedule
      const scheduleRes = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: false,
          actor: [{ reference: 'Practitioner/test' }],
        });
      expect(scheduleRes.status).toBe(201);
      const schedule = scheduleRes.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule.id! });

      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/${schedule.id}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      expect(res.body.issue?.[0]?.details?.text).toContain('is not active');
    });

    test('Return error for invalid schedule reference format', async () => {
      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=InvalidFormat/test`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      expect(res.body.issue?.[0]?.details?.text).toContain('Invalid schedule reference format');
      expect(res.body.issue?.[0]?.details?.text).toContain('Expected Schedule/{id}');
    });

    test('Return error for missing schedule ID in reference', async () => {
      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(400);
      // Should handle empty ID gracefully
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // Cycle 1.3: Simple Slot Response (No Availability Rules)
  describe('Cycle 1.3: Simple Slot Response', () => {
    test('Return empty Bundle for schedule with no slots in date range', async () => {
      // Create a Schedule
      const scheduleRes = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [{ reference: 'Practitioner/test' }],
        });
      expect(scheduleRes.status).toBe(201);
      const schedule = scheduleRes.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule.id! });

      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/${schedule.id}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(200);
      const bundle = res.body as Bundle;

      // Validate complete Bundle structure
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
      expect(bundle.entry).toBeDefined();
      expect(Array.isArray(bundle.entry)).toBe(true);
      expect(bundle.entry?.length).toBe(0);
      // Bundle should have total if empty
      if (bundle.total !== undefined) {
        expect(bundle.total).toBe(0);
      }
    });

    test('Return Bundle with virtual free slots based on explicit free Slots only', async () => {
      // Create a Schedule
      const scheduleRes = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [{ reference: 'Practitioner/test' }],
        });
      expect(scheduleRes.status).toBe(201);
      const schedule = scheduleRes.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule.id! });

      // Create an explicit free Slot
      const slotRes = await request(app)
        .post(`/fhir/R4/Slot`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Slot',
          status: 'free',
          schedule: { reference: `Schedule/${schedule.id}` },
          start: '2025-10-28T09:00:00Z',
          end: '2025-10-28T09:30:00Z',
        });
      expect(slotRes.status).toBe(201);
      const slot = slotRes.body as Slot;
      createdResources.push({ resourceType: 'Slot', id: slot.id! });

      const res = await request(app)
        .get(`/fhir/R4/Slot/$find?start=${TEST_START}&end=${TEST_END}&schedule=Schedule/${schedule.id}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(200);
      const bundle = res.body as Bundle;

      // Validate complete Bundle structure
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
      expect(bundle.entry).toBeDefined();
      expect(Array.isArray(bundle.entry)).toBe(true);
      expect(bundle.entry?.length).toBeGreaterThan(0);

      if (bundle.total !== undefined) {
        expect(bundle.total).toBe(bundle.entry?.length);
      }

      // Verify virtual slot structure - no IDs should be present
      const virtualSlot = bundle.entry?.[0]?.resource as Slot;
      expect(virtualSlot).toBeDefined();
      expect(virtualSlot.resourceType).toBe('Slot');
      expect(virtualSlot.status).toBe('free');
      expect(virtualSlot.schedule).toBeDefined();
      expect(virtualSlot.start).toBe('2025-10-28T09:00:00Z');
      expect(virtualSlot.end).toBe('2025-10-28T09:30:00Z');

      // Critical: Virtual slots must NOT have IDs
      expect(virtualSlot.id).toBeUndefined();
      expect(virtualSlot.meta).toBeUndefined();

      // Verify entry structure
      expect(bundle.entry?.[0]?.search).toBeDefined();
      expect(bundle.entry?.[0]?.search?.mode).toBe('match');
    });

    test('Verify Schedule/:id/$find endpoint works', async () => {
      // Create a Schedule
      const scheduleRes = await request(app)
        .post(`/fhir/R4/Schedule`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [{ reference: 'Practitioner/test' }],
        });
      expect(scheduleRes.status).toBe(201);
      const schedule = scheduleRes.body as Schedule;
      createdResources.push({ resourceType: 'Schedule', id: schedule.id! });

      // Test Schedule/:id/$find endpoint (schedule inferred from path)
      const res = await request(app)
        .get(`/fhir/R4/Schedule/${schedule.id}/$find?start=${TEST_START}&end=${TEST_END}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.status).toBe(200);
      const bundle = res.body as Bundle;
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
    });
  });
});

