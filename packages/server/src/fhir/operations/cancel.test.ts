// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, parseSearchRequest } from '@medplum/core';
import type { Appointment, Bundle, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getGlobalSystemRepo } from '../../fhir/repo';
import type { TestProjectResult } from '../../test.setup';
import { createTestProject } from '../../test.setup';

const systemRepo = getGlobalSystemRepo();
const app = express();
const request = supertest(app);

describe('Appointment/$cancel', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner: WithId<Practitioner>;
  let schedule: WithId<Schedule>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
    });

    schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      actor: [createReference(practitioner)],
      meta: { project: project.project.id },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeSlot(): Promise<WithId<Slot>> {
    return systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      status: 'busy',
      start: '2026-01-15T14:00:00Z',
      end: '2026-01-15T15:00:00Z',
      schedule: createReference(schedule),
      meta: { project: project.project.id },
    });
  }

  async function makeAppointment(
    status: Appointment['status'],
    slots: WithId<Slot>[] = []
  ): Promise<WithId<Appointment>> {
    // Appointments that are not proposed/cancelled/waitlist require start and end
    const noStartEnd: Appointment['status'][] = ['proposed', 'cancelled', 'waitlist'];
    const needsDates = !noStartEnd.includes(status);
    return systemRepo.createResource<Appointment>({
      resourceType: 'Appointment',
      status,
      ...(needsDates ? { start: '2026-01-15T14:00:00Z', end: '2026-01-15T15:00:00Z' } : {}),
      participant: [{ actor: createReference(practitioner), status: 'accepted' }],
      slot: slots.map((slot) => createReference(slot)),
      meta: { project: project.project.id },
    });
  }

  test('Succeeds for a booked appointment', async () => {
    const slot = await makeSlot();
    const appointment = await makeAppointment('booked', [slot]);

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);
  });

  test('Succeeds for a pending appointment', async () => {
    const slot = await makeSlot();
    const appointment = await makeAppointment('pending', [slot]);

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);
  });

  test('Returns Bundle with cancelled appointment', async () => {
    const slot = await makeSlot();
    const appointment = await makeAppointment('booked', [slot]);

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);

    const bundle = response.body as Bundle;
    expect(bundle).toHaveProperty('resourceType', 'Bundle');
    expect(bundle).toHaveProperty('type', 'transaction-response');
    expect(bundle.entry).toHaveLength(1);

    const updated = bundle.entry?.[0]?.resource as Appointment;
    expect(updated).toMatchObject({ resourceType: 'Appointment', id: appointment.id, status: 'cancelled' });
  });

  test('Deletes the referenced slot', async () => {
    const slot = await makeSlot();
    const appointment = await makeAppointment('booked', [slot]);

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);

    const remaining = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?_id=${slot.id}`));
    expect(remaining).toHaveLength(0);
  });

  test('Deletes multiple slots', async () => {
    const slot1 = await makeSlot();
    const slot2 = await makeSlot();
    const appointment = await makeAppointment('booked', [slot1, slot2]);

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);

    const remaining = await systemRepo.searchResources<Slot>(parseSearchRequest(`Slot?_id=${slot1.id},${slot2.id}`));
    expect(remaining).toHaveLength(0);
  });

  test('Succeeds for appointment with no slots', async () => {
    const appointment = await makeAppointment('booked');

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);
  });

  test.each(['cancelled', 'fulfilled', 'noshow', 'entered-in-error'] as Appointment['status'][])(
    'Returns 400 for non-cancelable status: %s',
    async (status) => {
      const appointment = await makeAppointment(status);

      const response = await request
        .post('/fhir/R4/Appointment/$cancel')
        .set('Authorization', `Bearer ${project.accessToken}`)
        .send({
          resourceType: 'Parameters',
          parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
        });

      expect(response.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: 'Appointment is not in cancelable state due to status' },
          },
        ],
      });
      expect(response.status).toEqual(400);
    }
  );

  test('Returns 404 when appointment does not exist', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'appointment-reference',
            valueReference: { reference: 'Appointment/00000000-0000-0000-0000-000000000000' },
          },
        ],
      });

    expect(response.status).toEqual(404);
  });

  test('Returns 400 when appointment-reference parameter is missing', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({ resourceType: 'Parameters', parameter: [] });

    expect(response.status).toEqual(400);
  });

  test('Returns 400 when a referenced slot does not exist', async () => {
    const appointment = await systemRepo.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      start: '2026-01-15T14:00:00Z',
      end: '2026-01-15T15:00:00Z',
      participant: [{ actor: createReference(practitioner), status: 'accepted' }],
      slot: [{ reference: 'Slot/00000000-0000-0000-0000-000000000000' }],
      meta: { project: project.project.id },
    });

    const response = await request
      .post('/fhir/R4/Appointment/$cancel')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment-reference', valueReference: createReference(appointment) }],
      });

    expect(response.status).toEqual(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'Loading slots failed' } }],
    });
  });
});
