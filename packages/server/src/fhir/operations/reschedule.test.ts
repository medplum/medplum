// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, isDefined, parseSearchRequest, toServiceTypeCodeableConcepts } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  HealthcareService,
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
import type { SchedulingParametersExtensionExtension } from './utils/scheduling-parameters';

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

describe('Appointment/$reschedule', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner: WithId<Practitioner>;
  let officeVisitService: WithId<HealthcareService>;
  let schedule: WithId<Schedule>;

  const officeVisit: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.transactionAttempts = 5;
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });

    officeVisitService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [officeVisit],
      meta: { project: project.project.id },
    });

    schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(practitioner)],
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            threeDayAvailability,
            { url: 'duration', valueDuration: { value: 60, unit: 'min' } },
            { url: 'service', valueReference: createReference(officeVisitService) },
          ],
        },
      ],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function proposedAppointment(start: string, end: string): Appointment {
    return {
      resourceType: 'Appointment',
      status: 'proposed',
      start,
      end,
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      participant: [{ actor: createReference(practitioner), status: 'tentative' }],
      contained: [
        {
          resourceType: 'Slot',
          status: 'busy',
          schedule: createReference(schedule),
          start,
          end,
        } satisfies Slot,
      ],
    };
  }

  async function bookAppointment(start: string, end: string): Promise<WithId<Appointment>> {
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: proposedAppointment(start, end) }],
      });
    expect(response).toHaveStatus(201);
    const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const appointment = entries.find(isAppointment);
    expect(appointment?.id).toBeDefined();
    return appointment as WithId<Appointment>;
  }

  test('cancels the original appointment and books a new one', async () => {
    const original = await bookAppointment('2026-01-15T14:00:00Z', '2026-01-15T15:00:00Z');
    const originalSlotIds = original.slot?.map((s) => s.reference?.split('/')[1]).filter(isDefined) ?? [];
    const start = '2026-01-15T16:00:00Z';
    const end = '2026-01-15T17:00:00Z';

    const response = await request
      .post(`/fhir/R4/Appointment/${original.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: proposedAppointment(start, end) }],
      });

    expect(response).toHaveStatus(201);

    const entries = ((response.body as Bundle).entry ?? []).map((e) => e.resource).filter(isDefined);
    const appointments = entries.filter(isAppointment);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].id).not.toBe(original.id);
    expect(appointments[0]).toMatchObject({ status: 'booked', start, end });

    const slots = entries.filter(isSlot);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ status: 'busy', start, end });

    const cancelled = await systemRepo.readResource<Appointment>('Appointment', original.id);
    expect(cancelled.status).toBe('cancelled');

    const remainingOriginalSlots = await systemRepo.searchResources<Slot>(
      parseSearchRequest(`Slot?_id=${originalSlotIds.join(',')}`)
    );
    expect(remainingOriginalSlots).toHaveLength(0);
  });

  test('succeeds for a pending appointment', async () => {
    const holdResponse = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'appointment', resource: proposedAppointment('2026-01-14T14:00:00Z', '2026-01-14T15:00:00Z') },
        ],
      });
    expect(holdResponse).toHaveStatus(201);
    const held = ((holdResponse.body as Bundle).entry ?? [])
      .map((e) => e.resource)
      .filter(isDefined)
      .find(isAppointment);
    expect(held?.id).toBeDefined();
    expect(held?.status).toBe('pending');

    const start = '2026-01-14T16:00:00Z';
    const end = '2026-01-14T17:00:00Z';
    const response = await request
      .post(`/fhir/R4/Appointment/${held?.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: proposedAppointment(start, end) }],
      });

    expect(response).toHaveStatus(201);
    const cancelled = await systemRepo.readResource<Appointment>('Appointment', held?.id as string);
    expect(cancelled.status).toBe('cancelled');
  });

  test('can reuse the original time window after releasing its slots', async () => {
    const start = '2026-01-13T14:00:00Z';
    const end = '2026-01-13T15:00:00Z';
    const original = await bookAppointment(start, end);

    const response = await request
      .post(`/fhir/R4/Appointment/${original.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: proposedAppointment(start, end) }],
      });

    expect(response).toHaveStatus(201);
    const cancelled = await systemRepo.readResource<Appointment>('Appointment', original.id);
    expect(cancelled.status).toBe('cancelled');
  });

  test('leaves the original appointment booked when the new time is unavailable', async () => {
    const original = await bookAppointment('2026-01-15T18:00:00Z', '2026-01-15T19:00:00Z');
    const start = '2026-01-15T07:00:00-04:00';
    const end = '2026-01-15T08:00:00-04:00';

    const response = await request
      .post(`/fhir/R4/Appointment/${original.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: proposedAppointment(start, end) }],
      });

    expect(response).toHaveStatus(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'Requested time slot is not available' } }],
    });

    const stillBooked = await systemRepo.readResource<Appointment>('Appointment', original.id);
    expect(stillBooked.status).toBe('booked');
  });

  test.each(['cancelled', 'fulfilled', 'noshow', 'entered-in-error'] as Appointment['status'][])(
    'returns 400 for non-reschedulable status: %s',
    async (status) => {
      const noStartEnd: Appointment['status'][] = ['cancelled'];
      const appointment = await systemRepo.createResource<Appointment>({
        resourceType: 'Appointment',
        status,
        ...(noStartEnd.includes(status) ? {} : { start: '2026-01-15T14:00:00Z', end: '2026-01-15T15:00:00Z' }),
        participant: [{ actor: createReference(practitioner), status: 'accepted' }],
        meta: { project: project.project.id },
      });

      const response = await request
        .post(`/fhir/R4/Appointment/${appointment.id}/$reschedule`)
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'appointment', resource: proposedAppointment('2026-01-15T16:00:00Z', '2026-01-15T17:00:00Z') },
          ],
        });

      expect(response).toHaveStatus(400);
      expect(response.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: `Appointment cannot be canceled in '${status}' status` },
          },
        ],
      });
    }
  );

  test('returns 404 when the original appointment does not exist', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/00000000-0000-0000-0000-000000000000/$reschedule')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'appointment', resource: proposedAppointment('2026-01-15T16:00:00Z', '2026-01-15T17:00:00Z') },
        ],
      });

    expect(response).toHaveStatus(404);
  });

  test('returns 400 when the appointment parameter is missing', async () => {
    const original = await bookAppointment('2026-01-14T18:00:00Z', '2026-01-14T19:00:00Z');

    const response = await request
      .post(`/fhir/R4/Appointment/${original.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({ resourceType: 'Parameters', parameter: [] });

    expect(response).toHaveStatus(400);
  });
});
