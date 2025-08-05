// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Appointment, Bundle, Schedule, SearchParameter, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './book-appointment';

describe('Book Appointment', async () => {
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

  test('Successfully create the appointment', async () => {
    const schedule: Schedule = await medplum.createResource({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: 'Practitioner/dr-alice-smith' }],
    });

    let slot: Slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'free',
      start: '2024-08-14T10:00:00.000Z',
      end: '2024-08-14T11:00:00.000Z',
      schedule: createReference(schedule),
    });

    const appointmentInput: Appointment = {
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
      comment: 'The patient is feeling much better',
    };

    const appointment = await handler(medplum, { bot, input: appointmentInput, contentType, secrets: {} });

    slot = await medplum.readResource('Slot', slot.id as string);

    // Check that the appointment was created
    expect(appointment).toBeDefined();
    expect(appointment.start).toBe(slot.start);
    expect(appointment.end).toBe(slot.end);
    expect(appointment.comment).toBe('The patient is feeling much better');

    // Check that the slot was updated
    expect(slot.status).toBe('busy');
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

  test('Missing appointment type', async () => {
    const appointment: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      slot: [{ reference: 'Slot/123' }],
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
      'Must provide an appointment type'
    );
  });

  test('Missing service type', async () => {
    const appointment: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      slot: [{ reference: 'Slot/123' }],
      appointmentType: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
            code: 'FOLLOWUP',
            display: 'A follow up visit from a previous appointment',
          },
        ],
      },
      participant: [
        { actor: { reference: 'Patient/homer-simpson' }, status: 'accepted' },
        { actor: { reference: 'Practitioner/dr-alice-smith' }, status: 'accepted' },
      ],
    };

    await expect(handler(medplum, { bot, input: appointment, contentType, secrets: {} })).rejects.toThrow(
      'Must provide a service type'
    );
  });

  test('Invalid status', async () => {
    const appointment: Appointment = {
      resourceType: 'Appointment',
      status: 'cancelled',
      slot: [{ reference: 'Slot/123' }],
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
      'Appointment status must be "booked"'
    );
  });
});
