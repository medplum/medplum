import {
  BotEvent,
  ContentType,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect } from 'vitest';
import { handler } from './sample-account-setup';

describe('Sample Account Setup', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('New patient', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    const event: BotEvent = {
      bot: { reference: 'Bot/123' },
      contentType: ContentType.FHIR_JSON,
      input: patient,
      secrets: {},
    };
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
