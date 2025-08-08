// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Practitioner, SearchParameter } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { handler } from './example-data';

describe('Example Data', async () => {
  let medplum: MockClient;

  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const practitioner: Practitioner = DrAliceSmith;

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
    // Create a schedule for the practitioner
    await medplum.createResource({
      resourceType: 'Schedule',
      active: true,
      actor: [createReference(practitioner)],
    });
    // Delete all existing slots
    const slots = await medplum.searchResources('Slot');
    await Promise.all(slots.map((slot) => medplum.deleteResource('Slot', slot.id as string)));
    // Delete all existing appointments
    const appointments = await medplum.searchResources('Appointment');
    await Promise.all(
      appointments.map((appointment) => medplum.deleteResource('Appointment', appointment.id as string))
    );
    // Delete all existing encounters
    const encounters = await medplum.searchResources('Encounter');
    await Promise.all(encounters.map((encounter) => medplum.deleteResource('Encounter', encounter.id as string)));
  });

  test('Successfully create example data bundle', async () => {
    const bundle = await handler(medplum, { bot, input: practitioner, contentType, secrets: {} });

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry?.length).toBe(54);
    // 2 Patients
    expect(bundle.entry?.filter((e) => e.resource?.resourceType === 'Patient').length).toBe(2);
    // 46 Slots
    expect(bundle.entry?.filter((e) => e.resource?.resourceType === 'Slot').length).toBe(46);
    // 5 Appointments
    expect(bundle.entry?.filter((e) => e.resource?.resourceType === 'Appointment').length).toBe(5);
    // 1 Encounter
    expect(bundle.entry?.filter((e) => e.resource?.resourceType === 'Encounter').length).toBe(1);
  });
});
