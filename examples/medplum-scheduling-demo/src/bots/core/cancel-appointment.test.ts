// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Appointment, Bundle, Schedule, SearchParameter, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './cancel-appointment';

describe('Cancel Appointment', async () => {
  let medplum: MockClient;

  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
  });

  test('Successfully cancel the appointment', async () => {
    const schedule: Schedule = await medplum.createResource({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: 'Practitioner/dr-alice-smith' }],
    });

    const slot: Slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'busy',
      start: '2024-08-14T10:00:00.000Z',
      end: '2024-08-14T11:00:00.000Z',
      schedule: createReference(schedule),
    });

    const appointment: Appointment = await medplum.createResource({
      resourceType: 'Appointment',
      status: 'booked',
      slot: [createReference(slot)],
      appointmentType: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
            code: 'FOLLOWUP',
            display: 'A follow up visit from a previous appointment',
          },
        ],
      },
      serviceType: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '11429006',
              display: 'Consultation',
            },
          ],
        },
      ],
      participant: [
        { actor: { reference: 'Patient/homer-simpson' }, status: 'accepted' },
        { actor: { reference: 'Practitioner/dr-alice-smith' }, status: 'accepted' },
      ],
    });

    await handler(medplum, { bot, input: appointment, contentType, secrets: {} });

    // Check that the appointment was cancelled
    const cancelledAppointment = await medplum.readResource('Appointment', appointment.id as string);
    expect(cancelledAppointment).toBeDefined();
    expect(cancelledAppointment.status).toBe('cancelled');
    expect(cancelledAppointment.cancelationReason).toStrictEqual({
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason',
          code: 'prov',
          display: 'Provider',
        },
      ],
    });

    // Check that the original slot is still busy
    const updatedSlot = await medplum.readResource('Slot', slot.id as string);
    expect(updatedSlot).toBeDefined();
    expect(updatedSlot.status).toBe('busy');

    // Check that a new slot was created with status 'free'
    const slots = await medplum.searchResources('Slot', { schedule: `Schedule/${schedule.id}` });
    expect(slots).toBeDefined();
    expect(slots.length).toBe(2);
    const newSlot = slots.find((s) => s.status === 'free');
    expect(newSlot).toBeDefined();
    expect(newSlot?.id).not.toBe(updatedSlot.id);
  });

  test('Missing slot', async () => {
    const appointment: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      appointmentType: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
            code: 'FOLLOWUP',
            display: 'A follow up visit from a previous appointment',
          },
        ],
      },
      serviceType: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '11429006',
              display: 'Consultation',
            },
          ],
        },
      ],
      participant: [
        { actor: { reference: 'Patient/homer-simpson' }, status: 'accepted' },
        { actor: { reference: 'Practitioner/dr-alice-smith' }, status: 'accepted' },
      ],
    };

    await expect(handler(medplum, { bot, input: appointment, contentType, secrets: {} })).rejects.toThrow(
      'Must provide a slot'
    );
  });
});
