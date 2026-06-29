// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, isDefined, isResource } from '@medplum/core';
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

describe('Appointment/:id/$confirm', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner: WithId<Practitioner>;
  let schedule: WithId<Schedule>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    // try to be more resilient to concurrent tests touching the same tables
    config.transactionAttempts = 5;
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

  async function makeSlot(status: Slot['status'] = 'busy-tentative'): Promise<WithId<Slot>> {
    return systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      status,
      start: '2026-05-15T14:00:00Z',
      end: '2026-05-15T15:00:00Z',
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
      ...(needsDates ? { start: '2026-05-15T14:00:00Z', end: '2026-05-15T15:00:00Z' } : {}),
      participant: [{ actor: createReference(practitioner), status: 'accepted' }],
      slot: slots.map((slot) => createReference(slot)),
      meta: { project: project.project.id },
    });
  }

  test('Succeeds for a pending appointment', async () => {
    const slot = await makeSlot('busy-tentative');
    const appointment = await makeAppointment('pending', [slot]);

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);
  });

  test('Succeeds for a proposed appointment', async () => {
    // proposed appointments must have start/end so that confirming to 'booked' passes FHIR validation
    const appointment = await systemRepo.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'proposed',
      start: '2026-05-15T14:00:00Z',
      end: '2026-05-15T15:00:00Z',
      participant: [{ actor: createReference(practitioner), status: 'accepted' }],
      meta: { project: project.project.id },
    });

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);
  });

  test('Returns a Bundle containing the booked Appointment', async () => {
    const slot = await makeSlot('busy-tentative');
    const appointment = await makeAppointment('pending', [slot]);

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.status).toEqual(200);

    const bundle = response.body as Bundle;
    const entries = (bundle.entry ?? []).map((e) => e.resource).filter(isDefined);

    const appointments = entries.filter((r) => isResource<Appointment>(r, 'Appointment'));
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toMatchObject({ id: appointment.id, status: 'booked' });
  });

  test('Updates busy-tentative slots to busy', async () => {
    const slot = await makeSlot('busy-tentative');
    const appointment = await makeAppointment('pending', [slot]);

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.status).toEqual(200);

    const bundle = response.body as Bundle;
    const entries = (bundle.entry ?? []).map((e) => e.resource).filter(isDefined);
    const slots = entries.filter((r) => isResource<Slot>(r, 'Slot'));
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ id: slot.id, status: 'busy' });
  });

  test('Updates multiple busy-tentative slots', async () => {
    const slot1 = await makeSlot('busy-tentative');
    const slot2 = await makeSlot('busy-tentative');
    const appointment = await makeAppointment('pending', [slot1, slot2]);

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.status).toEqual(200);

    const bundle = response.body as Bundle;
    const entries = (bundle.entry ?? []).map((e) => e.resource).filter(isDefined);
    const slots = entries.filter((r) => isResource<Slot>(r, 'Slot'));
    expect(slots).toHaveLength(2);
    slots.forEach((s) => expect(s).toHaveProperty('status', 'busy'));
  });

  test('Does not modify slots that are already busy', async () => {
    const slot = await makeSlot('busy');
    const appointment = await makeAppointment('pending', [slot]);

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.status).toEqual(200);

    const persisted = await systemRepo.readResource<Slot>('Slot', slot.id);
    expect(persisted.status).toEqual('busy');
  });

  test('Succeeds for appointment with no slots', async () => {
    const appointment = await makeAppointment('pending');

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toEqual(200);
  });

  test.each(['booked', 'cancelled', 'fulfilled', 'noshow', 'entered-in-error'] as Appointment['status'][])(
    'Returns 400 for non-confirmable status: %s',
    async (status) => {
      const appointment = await makeAppointment(status);

      const response = await request
        .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
        .set('Authorization', `Bearer ${project.accessToken}`);

      expect(response.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            details: { text: `Appointment cannot be confirmed in '${status}' status` },
          },
        ],
      });
      expect(response.status).toEqual(400);
    }
  );

  test('Returns 404 when appointment does not exist', async () => {
    const response = await request
      .post('/fhir/R4/Appointment/00000000-0000-0000-0000-000000000000/$confirm')
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.status).toEqual(404);
  });

  test('Returns 400 when a referenced slot does not exist', async () => {
    const appointment = await systemRepo.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'pending',
      start: '2026-05-15T14:00:00Z',
      end: '2026-05-15T15:00:00Z',
      participant: [{ actor: createReference(practitioner), status: 'accepted' }],
      slot: [{ reference: 'Slot/00000000-0000-0000-0000-000000000000' }],
      meta: { project: project.project.id },
    });

    const response = await request
      .post(`/fhir/R4/Appointment/${appointment.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);

    expect(response.status).toEqual(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', details: { text: 'Loading slots failed' } }],
    });
  });
});
