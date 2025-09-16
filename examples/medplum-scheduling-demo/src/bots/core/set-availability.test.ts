// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Schedule, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler, SetAvailabilityEvent } from './set-availability';

describe('Set Availability', async () => {
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
    // Delete all existing slots
    const slots = await medplum.searchResources('Slot');
    await Promise.all(slots.map((slot) => medplum.deleteResource('Slot', slot.id as string)));
  });

  test('Successfully create free slots', async () => {
    const input: SetAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      startDate: '2024-08-19',
      endDate: '2024-08-21',
      startTime: '09:00:00',
      endTime: '17:00:00',
      duration: 120,
      daysOfWeek: ['mon', 'wed'],
      timezoneOffset: 480,
    };

    let freeSlots = await medplum.searchResources('Slot', {
      status: 'free',
    });

    expect(freeSlots.length).toBe(0);

    await handler(medplum, { bot, input, contentType, secrets: {} });

    // Create 8 free slots: 4 on Monday and 4 on Wednesday
    freeSlots = await medplum.searchResources('Slot', {
      status: 'free',
    });
    expect(freeSlots.length).toBe(8);
  });

  test('Invalid duration', async () => {
    const input: SetAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      startDate: '2024-08-19',
      endDate: '2024-08-21',
      startTime: '09:00:00',
      endTime: '17:00:00',
      duration: 0,
      daysOfWeek: ['mon', 'wed'],
      timezoneOffset: 480,
    };

    await expect(handler(medplum, { bot, input, contentType, secrets: {} })).rejects.toThrow(
      'Duration must be a positive number'
    );
  });

  test('End date before start date', async () => {
    const input: SetAvailabilityEvent = {
      schedule: createReference(schedule as Schedule),
      startDate: '2024-08-21',
      endDate: '2024-08-19',
      startTime: '09:00:00',
      endTime: '17:00:00',
      duration: 120,
      daysOfWeek: ['mon', 'wed'],
      timezoneOffset: 480,
    };

    await expect(handler(medplum, { bot, input, contentType, secrets: {} })).rejects.toThrow(
      'End date must be after start date'
    );
  });
});
