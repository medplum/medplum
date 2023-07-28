import {
  BotEvent,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect } from 'vitest';
import { handler } from './sample-account-setup';

describe('Sample Account Setup', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('New patient', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    const event: BotEvent = { contentType: 'application/fhir+json', input: patient, secrets: {} };
    await handler(medplum, event);

    const check = await medplum.readResource('Patient', patient.id as string);
    expect(check.generalPractitioner).toBeDefined();
    expect(check.generalPractitioner).toHaveLength(1);

    const observations = await medplum.searchResources('Observation', `subject=${getReferenceString(patient)}`);
    expect(observations.length).toBeGreaterThanOrEqual(1);

    const tasks = await medplum.searchResources('Task', `owner=${getReferenceString(patient)}`);
    expect(tasks.length).toEqual(3);
    expect(tasks.filter((t) => t.status === 'completed')).toHaveLength(2);
    expect(tasks.filter((t) => t.status === 'in-progress')).toHaveLength(1);
  });
});
