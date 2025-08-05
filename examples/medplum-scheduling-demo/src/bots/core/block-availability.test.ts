// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Appointment, Bundle, Schedule, SearchParameter, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { BlockAvailabilityEvent, handler } from './block-availability';

describe('Block Availability', async () => {
  let medplum: MockClient;
  let schedule: Schedule;

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
    schedule = await medplum.createResource({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: 'Practitioner/dr-alice-smith' }],
    });
  });

  test('Successfully block booked appointment', async () => {
    // Booked appointment
    const slot: Slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'busy',
      start: '2024-08-16T09:00:00.000Z',
      end: '2024-08-16T10:00:00.000Z',
      schedule: createReference(schedule),
    });
    const appointment: Appointment = await medplum.createResource({
      resourceType: 'Appointment',
      status: 'booked',
      slot: [createReference(slot)],
      start: slot.start,
      end: slot.end,
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

    const input: BlockAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      start: '2024-08-16T09:00:00.000Z',
      end: '2024-08-16T21:00:00.000Z',
    };

    const responseBundle = await handler(medplum, { bot, input, contentType, secrets: {} });

    // 1 busy-unavailable slot created
    // 1 booked appointments cancelled
    expect(responseBundle.entry?.length).toBe(2);

    // Check that the slot was created
    const createdSlot = responseBundle.entry?.[0].resource as Slot;
    expect(createdSlot.resourceType).toBe('Slot');
    expect(createdSlot.schedule).toStrictEqual(createReference(schedule));
    expect(createdSlot.start).toBe(input.start);
    expect(createdSlot.end).toBe(input.end);
    expect(createdSlot.status).toBe('busy-unavailable');

    // Check that the appointment was cancelled
    const cancelledAppointment = responseBundle.entry?.[1].resource as Appointment;
    expect(cancelledAppointment.resourceType).toBe('Appointment');
    expect(cancelledAppointment.id).toBe(appointment.id);
    expect(cancelledAppointment.status).toBe('cancelled');
  });

  test('No booked appointments to cancel', async () => {
    // Booked appointment outside of the block period
    const slot: Slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'busy',
      start: '2024-08-16T07:00:00.000Z',
      end: '2024-08-16T08:00:00.000Z',
      schedule: createReference(schedule),
    });
    const appointment: Appointment = await medplum.createResource({
      resourceType: 'Appointment',
      status: 'booked',
      slot: [createReference(slot)],
      start: slot.start,
      end: slot.end,
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

    const input: BlockAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      start: '2024-08-16T09:00:00.000Z',
      end: '2024-08-16T21:00:00.000Z',
    };

    const responseBundle = await handler(medplum, { bot, input, contentType, secrets: {} });

    // 1 busy-unavailable slot created
    expect(responseBundle.entry?.length).toBe(1);

    // Check that the slot was created
    const createdSlot = responseBundle.entry?.[0].resource as Slot;
    expect(createdSlot.resourceType).toBe('Slot');
    expect(createdSlot.schedule).toStrictEqual(createReference(schedule));
    expect(createdSlot.start).toBe(input.start);
    expect(createdSlot.end).toBe(input.end);
    expect(createdSlot.status).toBe('busy-unavailable');

    // Check that the appointment was not cancelled
    const refreshedAppointment = await medplum.readResource('Appointment', appointment.id as string);
    expect(refreshedAppointment).toBeDefined();
    expect(refreshedAppointment.status).toBe('booked');
  });

  test('Successfully block free slot', async () => {
    // Free slot
    const slot: Slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'free',
      start: '2024-08-16T10:00:00.000Z',
      end: '2024-08-16T11:00:00.000Z',
      schedule: createReference(schedule),
    });

    const input: BlockAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      start: '2024-08-16T09:00:00.000Z',
      end: '2024-08-16T21:00:00.000Z',
    };

    const responseBundle = await handler(medplum, { bot, input, contentType, secrets: {} });

    // 1 busy-unavailable slot created
    // 1 free slot blocked
    expect(responseBundle.entry?.length).toBe(2);

    // Check that the slot was created
    const createdSlot = responseBundle.entry?.[0].resource as Slot;
    expect(createdSlot.resourceType).toBe('Slot');
    expect(createdSlot.schedule).toStrictEqual(createReference(schedule));
    expect(createdSlot.start).toBe(input.start);
    expect(createdSlot.end).toBe(input.end);
    expect(createdSlot.status).toBe('busy-unavailable');

    // Check that the free slot was blocked
    const blockedSlot = responseBundle.entry?.[1].resource as Slot;
    expect(blockedSlot.resourceType).toBe('Slot');
    expect(blockedSlot.id).toBe(slot.id);
    expect(blockedSlot.status).toBe('busy-unavailable');
  });

  test('No free slots to block', async () => {
    // Free slot outside of the block period
    const slot: Slot = await medplum.createResource({
      resourceType: 'Slot',
      status: 'free',
      start: '2024-08-16T07:00:00.000Z',
      end: '2024-08-16T08:00:00.000Z',
      schedule: createReference(schedule),
    });

    const input: BlockAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      start: '2024-08-16T09:00:00.000Z',
      end: '2024-08-16T21:00:00.000Z',
    };

    const responseBundle = await handler(medplum, { bot, input, contentType, secrets: {} });

    // 1 busy-unavailable slot created
    expect(responseBundle.entry?.length).toBe(1);

    // Check that the slot was created
    const createdSlot = responseBundle.entry?.[0].resource as Slot;
    expect(createdSlot.resourceType).toBe('Slot');
    expect(createdSlot.schedule).toStrictEqual(createReference(schedule));
    expect(createdSlot.start).toBe(input.start);
    expect(createdSlot.end).toBe(input.end);
    expect(createdSlot.status).toBe('busy-unavailable');

    // Check that the free slot was not blocked
    const refreshedSlot = await medplum.readResource('Slot', slot.id as string);
    expect(refreshedSlot).toBeDefined();
    expect(refreshedSlot.status).toBe('free');
  });

  test('End date before start date', async () => {
    const input: BlockAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      start: '2024-08-16T21:00:00.000Z',
      end: '2024-08-16T17:00:00.000Z',
    };

    await expect(handler(medplum, { bot, input, contentType, secrets: {} })).rejects.toThrow(
      'End date must be after start date'
    );
  });
});
