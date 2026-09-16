// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { SCHEDULING_SEARCH_PARAMETERS } from './searchParameters';

/**
 * Every search parameter the scheduling components search by, per resource type.
 * A new search means a new entry here and in the fixture list.
 *
 * Kept by hand: the criteria are spread across components and built from objects,
 * chained parameters and `_sort` keys that no static scan reads reliably. A modifier
 * is the same parameter — `active:not` needs `active` registered.
 *
 * Nothing else in the suite can catch a miss: `test.setup.ts` indexes the full bundle
 * off disk, so every parameter resolves in a test run whether the fixtures hold it or
 * not. Only the browser runs on the fixtures alone, and there a missing one is silent.
 */
const CODES_IN_USE: Partial<Record<ResourceType, string[]>> = {
  Schedule: ['active', 'actor', 'service-type'],
  // Reached by chaining through `Schedule.actor`, never searched on their own, so both
  // ends of the chain have to be registered. Location is also searched directly, by
  // name and physical type, which is why it carries more than its chained codes.
  Practitioner: ['active', 'name'],
  Location: ['name', 'physical-type', 'status'],
  Device: ['device-name', 'status'],
  PractitionerRole: ['active', 'practitioner'],
  HealthcareService: ['active', 'location', 'name'],
  Patient: ['birthdate', 'name'],
  Slot: ['schedule', 'start', 'status'],
  Appointment: ['actor', 'date'],
};

describe('Storybook search parameters', () => {
  const registered = (SCHEDULING_SEARCH_PARAMETERS.entry ?? [])
    .map((entry) => entry.resource)
    .filter((parameter) => parameter !== undefined);

  test.each(Object.entries(CODES_IN_USE))('registers every %s parameter the components search by', (type, codes) => {
    const forType = registered.filter((parameter) => parameter.base?.includes(type as ResourceType)).map((p) => p.code);

    expect(forType).toEqual(expect.arrayContaining(codes));
  });
});
